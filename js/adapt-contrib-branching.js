import Backbone from 'backbone';
import Adapt from 'core/js/adapt';
import data from 'core/js/data';
import logging from 'core/js/logging';
import ComponentModel from 'core/js/models/componentModel';
import offlineStorage from 'core/js/offlineStorage';
import BranchingSet from './BranchingSet';

class Branching extends Backbone.Controller {

  initialize() {
    this._rawSets = [];
    this.openPopupCount = 0;
    this.shouldContinueOnPopupClose = false;
    this.listenTo(Adapt, {
      'app:dataReady': this.onAppDataReady,
      'popup:opened': this.onPopupOpened,
      'popup:closed': this.onPopupClosed,
      'assessments:reset': this.onAssessmentReset
    });
    this.listenTo(Adapt.articles, 'change:_isComplete', this.onArticleReset);
  }

  async onAppDataReady() {
    const config = Adapt.course.get('_branching');
    if (!config || !config._isEnabled) return;
    // Wait for all other app:dataReady handlers to finish
    if (this._isAwaitingDataReady) return;
    this._isAwaitingDataReady = true;
    await data.whenReady();
    this.warnForSpoorMisconfiguration();
    this._isAwaitingDataReady = false;
    this.setupBranchingModels();
    this.setupEventListeners();
    Adapt.trigger('branching:dataReady');
  }

  warnForSpoorMisconfiguration() {
    const config = Adapt.config.get('_spoor');
    const isMisconfigured = (config?._isEnabled && config?._tracking?._shouldStoreAttempts === false);
    if (!isMisconfigured) return;
    logging.error('Branching: Spoor is misconfigured. Branching requires _spoor._tracking._shouldStoreAttempts = true');
  }

  setupBranchingModels() {
    this._rawSets.length = 0;
    const containerModels = data.filter(model => {
      const type = model.get('_type');
      if (type === 'course') return false;
      const config = model.get('_branching');
      if (!config || !config._isEnabled) return false;
      if (type === 'article' && config._onChildren === undefined) {
        // Assume this is the authoring tool and that an article
        // is always a branching container.
        config._onChildren = true;
        model.set('_branching', config);
      }
      return (config._onChildren === true);
    });
    containerModels.forEach(containerModel => {
      const containerId = containerModel.get('_id');
      containerModel.set({
        // Allow containers to request children at render
        _canRequestChild: true,
        // Prevent default completion
        _requireCompletionOf: Number.POSITIVE_INFINITY
      });
      const children = [
        ...containerModel.getChildren(),
        ...data.filter(model => model.get('_branching')?._containerId === containerId)
      ].filter(Boolean);
      // Hide all branching container original children as only clones will be displayed
      children.forEach(child => {
        const config = child.get('_branching');
        if (!config || !config._isEnabled) return;
        config._containerId = config._containerId || containerId;
        // Make direct children unavailable
        const isDirectChild = (child.getParent().get('_id') === containerId);
        if (isDirectChild) child.setOnChildren({ _isAvailable: false });
        child.set({
          _isBranchChild: true,
          _isBranchClone: false
        });
        const descendants = [child].concat(child.getAllDescendantModels(true));
        // Link all branch questions to their original ids ready for
        // cloning and to facilitate save + restore
        descendants.forEach(descendant => {
          descendant.set('_branchOriginalModelId', descendant.get('_id'));
          // Stop original items saving their own attemptStates as attemptStates are used to save/restore branching
          if (descendant.isTypeGroup('component')) descendant.set('_shouldStoreAttempts', false);
        });
      });
      const set = new BranchingSet({ model: containerModel });
      this._rawSets.push(set);
    });
  }

  get subsets() {
    return this._rawSets;
  }

  getSubsetByModelId(modelId) {
    return this._rawSets.find(set => set.model.get('_id') === modelId);
  }

  setupEventListeners() {
    this.listenTo(Adapt, 'view:requestChild', this.onRequestChild);
    this.listenTo(data, 'change:_isComplete', this.onComplete);
  }

  onRequestChild(event) {
    const set = this.getSubsetByModelId(event.target.model.get('_id'));
    if (!set) return;
    const nextModel = set.getNextModel();
    if (nextModel === false) {
      // Previous model isn't complete
      return;
    }
    if (nextModel === true) {
      // No further models, manually check completion of branching container
      const containerModel = event.target.model;
      containerModel.set('_requireCompletionOf', -1);
      containerModel.checkCompletionStatus();
      return;
    }
    const clonedModel = set.addNextModel(nextModel);
    event.model = clonedModel;
    // Stop rendering children in this parent to allow for user responses
    event.stopNext();
  }

  onPopupOpened() {
    this.openPopupCount++;
  }

  onPopupClosed() {
    this.openPopupCount--;
    if (!this.shouldContinueOnPopupClose || this.openPopupCount > 0) return;
    this.shouldContinueOnPopupClose = false;
    this.continue();
  }

  onArticleReset(model, isComplete) {
    if (isComplete) return;
    const set = this.getSubsetByModelId(model.get('_id'));
    if (!set) return;
    set.reset({ removeViews: true });
  }

  onAssessmentReset(state) {
    const set = this.getSubsetByModelId(state.articleId);
    if (!set) return;
    set.reset({ removeViews: true });
  }

  async continue() {
    if (!Adapt.parentView) return;

    if (this.openPopupCount) {
      this.shouldContinueOnPopupClose = true;
      return;
    }
    await Adapt.parentView.addChildren();
  }

  onComplete(model, value) {
    if (!value) return;
    this.continueAfterBranchChild(model);
    this.saveBranchQuestionAttemptHistory(model);
  }

  continueAfterBranchChild(model) {
    this.checkIfIsEffectivelyComplete(model);
    if (!model.get('_isBranchChild') || !model.get('_isAvailable')) return;
    this.continue();
  }

  /**
   * Check if, excluding _isTrackable: false elements, that the branching is
   * effectively complete and set completion criteria accordingly.
   * @param {Backbone.model} model
   */
  checkIfIsEffectivelyComplete(model) {
    const childModel = model.getParent();
    if (!childModel) return;
    const isBranchChild = childModel.get('_isBranchChild');
    if (!isBranchChild) return;
    const requireCompletionOf = childModel.get('_requireCompletionOf');
    const hasStandardCompletionCriteria = (requireCompletionOf !== -1);
    if (hasStandardCompletionCriteria) return;
    // Excludes non-trackable extension components, like trickle buttons
    const areAllAvailableTrackableChildrenComplete = childModel.getChildren()
      .filter(model => model.get('_isAvailble') && model.get('_isTrackable'))
      .every(model => model.get('_isComplete'));
    if (!areAllAvailableTrackableChildrenComplete) return;
    const containerModel = childModel.getParent();
    const set = this.getSubsetByModelId(containerModel.get('_id'));
    const isInValidBranchingSet = Boolean(set);
    if (!isInValidBranchingSet) return;
    const nextModel = set.getNextModel({ isTheoretical: true });
    const isBranchingFinished = (nextModel === true);
    if (!isBranchingFinished) return;
    // Allow assessment to complete at the end, before the last trickle button is clicked
    containerModel.set('_requireCompletionOf', -1);
    containerModel.checkCompletionStatus();
  }

  saveBranchQuestionAttemptHistory(model) {
    if (!(model instanceof ComponentModel)) return;
    const branchOriginModelId = model.get('_branchOriginalModelId');
    if (!branchOriginModelId) return;
    const originModel = data.findById(branchOriginModelId);
    originModel.addAttemptObject(model.getAttemptObject());
    offlineStorage.save();
  }

}

export default (Adapt.branching = new Branching());
