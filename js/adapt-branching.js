define([
  'core/js/adapt',
  'core/js/models/questionModel',
  'core/js/models/componentModel'
], function(Adapt, QuestionModel, ComponentModel) {

  class Branching extends Backbone.Controller {

    initialize() {
      this.id = 0;
      this.listenToOnce(Adapt, {
        "app:dataReady": this.onAppDataReady
      });
    }

    async onAppDataReady() {
      const config = Adapt.course.get('_branching');
      if (!config || !config._isEnabled) return;
      await Adapt.data.whenReady();
      this.setupBranching();
      this.setupEventListeners();
    }

    setupBranching() {
      const containers = Adapt.course.getAllDescendantModels(true).filter(model => {
        const config = model.get('_branching');
        if (!config || !config._isContainer) return;
        return true;
      });
      containers.forEach(container => {
        container.set('_canRequestChild', true);
        const children = container.getChildren();
        children.forEach(child => {
          child.setOnChildren({
            _isAvailable: false
          });
        });
        const config = container.get('_branching');
        if (this.restoreModelOrder(container, config)) {
          return;
        }
        const model = this.getNextModel(container, config);
        this.addNextModel(container, model);
      });
    }

    restoreModelOrder(container, config) {
      const branching = Adapt.offlineStorage.get('b');
      if (!branching) {
        return;
      }
      const id = container.get('_id');
      if (!branching[id]) {
        return;
      }
      const trackingIds = Adapt.offlineStorage.deserialize(branching[id]);
      container.set("_isBranchingRestoring", true);
      trackingIds.forEach(trackingId => {
        const model = this.findModelFromTrackingId(container, trackingId);
        this.addNextModel(container, model, true);
      });
      container.set("_isBranchingRestoring", false);
      return true;
    }

    findModelFromTrackingId(model, trackingId) {
      const children = model.getChildren();
      return children.find(child => {
        return [child].concat(child.getAllDescendantModels(true)).find(child => {
          return child.get('_trackingId') === trackingId;
        });
      });
    }

    setupEventListeners() {
      this.listenTo(Adapt, {
        'view:requestChild': this.onRequestChild
      });
      this.listenTo(Adapt.data, {
        'change:_isComplete': this.onBranchComplete,
        'change:_isComplete': this.onQuestionComplete
      });
    }

    onRequestChild(event) {
      const config = event.target.model.get('_branching');
      if (!config || !config._isContainer) return;
      const model = this.getNextModel(event.target.model, config);
      if (!model) {
        event.stop();
        return;
      }
      const clonedModel = this.addNextModel(event.target.model, model);
      event.model = clonedModel;
      Adapt.log.debug(`BRANCHING: ${model.get('_id')} cloned, attempt ${model.get('_branchAttempts')}`);
      event.stop(false);
    }

    getNextModel(container, config) {;
      const children = container.getChildren().models;
      const availableChildren = children.filter(model => model.get('_isAvailable'));

      if (!availableChildren.length) {
        // Starting model
        return children.find(child => child.get('_id') === config._start);
      }

      const lastChildModel = availableChildren[availableChildren.length - 1];
      if (!lastChildModel.get('_isComplete')) {
        // Last model not yet complete
        return;
      }

      // Branch from last model
      const correctness = this.fetchCorrectness(lastChildModel);
      const lastConfig = lastChildModel.get('_branching') || {};
      let nextId;
      switch (correctness) {
        case 'none':
          nextId = lastConfig._correct;
          break;
        case 'correct':
          nextId = lastConfig._correct;
          break;
        case 'partial':
          nextId = lastConfig._partial;
          break;
        default:
          nextId = lastConfig._incorrect;
          break;
      }

      return children.find(child => child.get('_id') === nextId);
    }

    fetchCorrectness(model) {
      const questions = model.findDescendantModels('question');
      if (!questions.length) {
        return 'none';
      }
      const firstQuestion = questions[0];
      if (firstQuestion.isCorrect()) return 'correct';
      if (firstQuestion.isPartlyCorrect()) return 'partial';
      return 'incorrect';
    }

    addNextModel(container, nextModel, restore = false) {
      [nextModel].concat(nextModel.getAllDescendantModels(true)).forEach(model => {
        const branchAttempts = (model.get('_branchAttempts') || 0);
        model.set('_branchAttempts', branchAttempts + 1);
      });
      let hasRestored = false;
      const cloned = nextModel.deepClone({
        _isBranch: true,
        _isAvailable: true
      }, {
        _isAvailable: true
      }, (model, clone) => {
        clone.set('_branchModelId', model.get('_id'));
        if (clone.has('_trackingId')) {
          clone.set('_trackingId', -1);
        }
        if (clone instanceof QuestionModel) {
          clone.set({
            '_isBranchQuestion': true,
            '_attemptStates': false
          });
          let isRestored = false;
          if (restore) {
            const attemptIndex = clone.get('_branchAttempts') - 1;
            const attemptObjects = model.getAttemptObjects();
            if (attemptObjects[attemptIndex]) {
              clone.set(attemptObjects[attemptIndex]);
              isRestored = true;
              hasRestored = true;
            }
          }
          if (restore && !isRestored || !restore) {
            clone.reset('hard', true);
          }
        }
      });
      if (hasRestored) {
        // If part of the branch has been restored assume it was all completed
        cloned.getAllDescendantModels(true).reverse().forEach(model => {
          model.setCompletionStatus();
        });
        cloned.setCompletionStatus();
      }
      this.saveModelOrder(container, nextModel);
      return cloned;
    }

    saveModelOrder(container, nextModel) {
      if (container.get("_isBranchingRestoring")) return;
      const branching = Adapt.offlineStorage.get('b') || {};
      const id = container.get('_id');
      const trackingIds = branching[id] && Adapt.offlineStorage.deserialize(branching[id]) || [];
      trackingIds.push(this.findTrackingIdFromModel(nextModel));
      branching[id] = Adapt.offlineStorage.serialize(trackingIds);
      Adapt.offlineStorage.set('b', branching);
    }

    findTrackingIdFromModel(nextModel) {
      const trackingIdModel = [nextModel].concat(nextModel.getAncestorModels()).find(model => model.has('_trackingId'));
      return trackingIdModel.get('_trackingId');
    }

    onBranchComplete(model, value) {
      if (!value || !model.get('_isBranch')) return;
      Adapt.parentView.addChildren();
    }

    onQuestionComplete(model, value) {
      if (!value || !model.get('_isBranchQuestion')) return;
      const branchModelId = model.get('_branchModelId');
      const originalModel = Adapt.findById(branchModelId)
      originalModel.addAttemptObject(model.getAttemptObject());
      Adapt.offlineStorage.save();
    }

  }

  return Adapt.branching = new Branching();

});
