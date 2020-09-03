define([
  'core/js/adapt',
  'core/js/models/questionModel'
], function(Adapt, QuestionModel) {

  class Branching extends Backbone.Controller {

    initialize() {
      this.isRestoring = false;
      this.openPopupCount = 0;
      this.shouldContinueOnPopupClose = false;
      this.listenTo(Adapt, {
        'app:dataReady': this.onAppDataReady,
        'popup:opened': this.onPopupOpened,
        'popup:closed': this.onPopupClosed
      });
    }

    async onAppDataReady() {
      const config = Adapt.course.get('_branching');
      if (!config || !config._isEnabled) return;
      // Wait for all other app:dataReady handlers to finish
      await Adapt.data.whenReady();
      this.setupBranching();
      this.setupEventListeners();
    }

    setupBranching() {
      const containerModels = Adapt.course.getAllDescendantModels(true).filter(model => {
        const config = model.get('_branching');
        if (!config || !config._isEnabled) return;
        if (model.get('_type') === 'article' && config._onChildren === undefined) {
          // Assume this is the authoring tool and that an article
          // is always a branching container.
          config._onChildren = true;
          model.set('_branching', config);
        }
        return (config._onChildren === true);
      });
      containerModels.forEach(containerModel => {
        containerModel.set({
          // Allow containers to request children at render
          _canRequestChild: true,
          // Prevent default completion
          _requireCompletionOf: Number.POSITIVE_INFINITY
        });
        const children = containerModel.getChildren();
        // Hide all branching container original children as only clones will be displayed
        children.forEach(child => {
          child.set('_isBranchChild', true);
          child.setOnChildren({ _isAvailable: false });
          const descendants = [child].concat(child.getAllDescendantModels(true));
          // Link all branch questions to their original ids ready for
          // cloning and to facilitate save + restore
          descendants.forEach(descendant => {
            if (!(descendant instanceof QuestionModel)) return;
            descendant.set('_branchOriginalModelId', descendant.get('_id'));
          });
        });

        const wasRestored = this.restoreContainerChildren(containerModel);
        if (wasRestored) {
          // Finish if the container was restored
          return;
        }
        // Find and add the first child if the container was not restored
        const config = containerModel.get('_branching');
        const model = this.getNextModel(containerModel, config);
        this.addNextModel(containerModel, model);
      });
    }

    restoreContainerChildren(container) {
      const branching = Adapt.offlineStorage.get('b');
      if (!branching) return;
      const id = container.get('_id');
      if (!branching[id]) return;
      const trackingPositions = Adapt.offlineStorage.deserialize(branching[id]);
      // Prevent save functionality from executing until restoration is finished
      this.isRestoring = true;
      trackingPositions.forEach(trackingPosition => {
        const model = this.getModelFromTrackingPosition(trackingPosition);
        this.addNextModel(container, model, true);
      });
      this.isRestoring = false;
      return true;
    }

    /**
     * Returns the model represented by the trackingPosition.
     * @param {Array<Number, Number>} trackingPosition Represents the relative location of a model to a _trackingId
     * @returns {Backbone.Model}
     */
    getModelFromTrackingPosition(trackingPosition) {
      const [ trackingId, indexInTrackingIdGroup ] = trackingPosition;
      const trackingIdModel = Adapt.data.find(model => model.get('_trackingId') === trackingId);
      if (indexInTrackingIdGroup >= 0) {
        // Model is either the trackingId model or a descendant
        const trackingIdGroup = [trackingIdModel].concat(trackingIdModel.getAllDescendantModels(true));
        return trackingIdGroup[indexInTrackingIdGroup];
      }
      // Model is an ancestor of the tracking id
      const trackingIdAncestors = trackingIdModel.getAncestorModels();
      const ancestorDistance = Math.abs(indexInTrackingIdGroup);
      return trackingIdAncestors[ancestorDistance];
    }

    setupEventListeners() {
      this.listenTo(Adapt, 'view:requestChild', this.onRequestChild);
      this.listenTo(Adapt.data, 'change:_isComplete', this.onComplete);
    }

    onRequestChild(event) {
      const config = event.target.model.get('_branching');
      if (!config || !config._onChildren) return;
      const model = this.getNextModel(event.target.model, config);
      if (model === false) {
        // Previous model isn't complete
        return;
      }
      if (model === true) {
        // No further models, manually complete branching container
        event.target.model.setCompletionStatus();
        return;
      }
      const clonedModel = this.addNextModel(event.target.model, model);
      event.model = clonedModel;
      // Stop rendering children in this parent to allow for user responses
      event.stopNext();
    }

    getNextModel(container, config) {
      const children = container.getChildren();
      const availableChildren = children.filter(model => model.get('_isAvailable'));

      const isAtStart = !availableChildren.length;
      if (isAtStart) {
        const firstModel = children.findWhere({ _id: config._start });
        return firstModel;
      }

      const lastChildModel = availableChildren[availableChildren.length - 1];
      const isLastIncomplete = !lastChildModel.get('_isComplete');
      if (isLastIncomplete) {
        return false;
      }

      const lastChildConfig = lastChildModel.get('_branching');
      if (!lastChildConfig || !lastChildConfig._isEnabled) return true;

      // Branch from the last model's correctness, if configured
      const correctness = this.getModelCorrectness(lastChildModel);
      const nextId = lastChildConfig[`_${correctness}`];
      if (!nextId) return true;

      return children.findWhere({ _id: nextId }) || true;
    }

    getModelCorrectness(model) {
      const questions = model.findDescendantModels('question').filter(model => !model.get('_isOptional'));
      if (!questions.length) return 'correct';
      const questionStates = questions.map(question => {
        if (question.isCorrect()) return 'correct';
        if (question.isPartlyCorrect()) return 'partlyCorrect';
        return 'incorrect';
      });
      const areAllCorrect = questionStates.every(state => state === 'correct');
      const isPartlyCorrect = questionStates.some(state => state === 'correct' || state === 'partlyCorrect');
      return areAllCorrect ? 'correct' : isPartlyCorrect ? 'partlyCorrect' : 'incorrect';
    }

    addNextModel(container, nextModel, shouldRestore = false) {
      const attemptIndex = (nextModel.get('_branchAttempts') || 0);
      nextModel.set('_branchAttempts', attemptIndex + 1);
      let wasAnyPartRestored = false;
      const cloned = nextModel.deepClone((clone, model) => {
        clone.set('_isAvailable', true);
        // Remove tracking ids as these will change depending on the branches
        // Clone attempt states are stored on the original model in their order of occurance
        if (clone.has('_trackingId')) {
          clone.unset('_trackingId');
        }
        if (clone instanceof QuestionModel) {
          // Clear clone response history
          clone.set('_attemptStates', false);
          if (shouldRestore) {
            // Restore the attempt state from the original model in occurance order
            const attemptObjects = model.getAttemptObjects();
            if (attemptObjects[attemptIndex]) {
              clone.set(attemptObjects[attemptIndex]);
              wasAnyPartRestored = true;
            }
            return;
          }
          // Reset if not restored or not a question
          clone.reset('hard', true);
        }
      });
      if (wasAnyPartRestored) {
        // If part of the branch has been restored then assume it was all completed.
        // This is as presentation the component's attempt states and completions do not
        // get saved and restored as part of the branching extension.
        cloned.getAllDescendantModels(true).reverse().forEach(model => {
          model.setCompletionStatus();
        });
        cloned.setCompletionStatus();
      }
      // Add the cloned model to the parent hierarchy
      nextModel.getParent().getChildren().add(cloned);
      this.saveContainerChild(container, nextModel);
      return cloned;
    }

    saveContainerChild(container, nextModel) {
      if (this.isRestoring) return;
      const branching = Adapt.offlineStorage.get('b') || {};
      const id = container.get('_id');
      const trackingIds = (branching[id] && Adapt.offlineStorage.deserialize(branching[id])) || [];
      trackingIds.push(this.getTrackingPositionFromModel(nextModel));
      branching[id] = Adapt.offlineStorage.serialize(trackingIds);
      Adapt.offlineStorage.set('b', branching);
    }

    /**
     * Fetch an array representing the relative location of nextModel to the nearest tracking id.
     * @param {Backbone.Model} nextModel
     * @returns {Array<Number, Number>}
     */
    getTrackingPositionFromModel(nextModel) {
      const firstDescendant = nextModel.getAllDescendantModels(false).concat([nextModel])[0];
      const nearestTrackingIdModel = [firstDescendant].concat(firstDescendant.getAncestorModels()).find(model => model.has('_trackingId'));
      const trackingId = nearestTrackingIdModel.get('_trackingId');
      const trackingIdGroup = [nearestTrackingIdModel].concat(nearestTrackingIdModel.getAllDescendantModels(true));
      const indexInTrackingIdGroup = trackingIdGroup.findIndex(descendant => descendant === nextModel);
      if (indexInTrackingIdGroup >= 0) {
        // Is either the nearestTrackingIdModel (0) or one of its flattened descendants (>0)
        return [ trackingId, indexInTrackingIdGroup ];
      }
      // Is an ancestor of the nearestTrackingIdModel
      const trackingIdAncestors = nearestTrackingIdModel.getAncestorModels();
      const ancestorDistance = trackingIdAncestors.findIndex(ancestor => ancestor === nextModel);
      return [ trackingId, -ancestorDistance ];
    }

    onPopupOpened() {
      this.openPopupCount++;
    }

    onPopupClosed() {
      this.openPopupCount--;
      if (!this.shouldContinueOnPopupClose) return;
      if (this.openPopupCount > 0) return;
      this.shouldContinueOnPopupClose = false;
      this.continue();
    }

    async continue() {
      if (this.openPopupCount) {
        this.shouldContinueOnPopupClose = true;
        return;
      }
      await Adapt.parentView.addChildren();
    }

    onComplete(model, value) {
      this.onBranchChildComplete(model, value);
      this.onBranchQuestionComplete(model, value);
    }

    onBranchChildComplete(model, value) {
      if (!value || !model.get('_isBranchChild')) return;
      this.continue();
    }

    onBranchQuestionComplete(model, value) {
      const branchOriginModelId = model.get('_branchOriginalModelId');
      if (!value || !branchOriginModelId) return;
      const originModel = Adapt.findById(branchOriginModelId);
      originModel.addAttemptObject(model.getAttemptObject());
      Adapt.offlineStorage.save();
    }

  }

  return (Adapt.branching = new Branching());

});
