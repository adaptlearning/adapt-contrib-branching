import Backbone from 'backbone';
import Adapt from 'core/js/adapt';
import data from 'core/js/data';
import logging from 'core/js/logging';
import ComponentModel from 'core/js/models/componentModel';
import offlineStorage from 'core/js/offlineStorage';
import BranchingSet from './BranchingSet';

class Branching extends Backbone.Controller {

  initialize() {
    /** @type {[BranchingSet]} */
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
      const set = new BranchingSet({ model: containerModel });
      this._rawSets.push(set);
    });
    this._rawSets.forEach(set => set.initialize());
  }

  get subsets() {
    return this._rawSets;
  }

  getSubsetByModelId(modelId) {
    return this._rawSets.find(set => set.model.get('_id') === modelId || set.models.find(model => model.get('_id') === modelId));
  }

  setupEventListeners() {
    this.listenTo(Adapt, 'view:requestChild', this.onRequestChild);
    this.listenTo(data, 'change:_isComplete', this.onComplete);
  }

  onRequestChild(event) {
    const set = this.getSubsetByModelId(event.target.model.get('_id'));
    if (!set) return;
    set.checkResetOnStartChange();
    const nextModel = set.getNextModel();
    if (nextModel === false) {
      // Previous model isn't complete
      return;
    }
    if (nextModel === true) {
      // No further models, manually check completion of branching container
      set.enableParentCompletion();
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
    this.saveBranchQuestionAttemptHistory(model);
    this.continueAfterBranchChild(model);
  }

  continueAfterBranchChild(model) {
    this.checkIfIsEffectivelyComplete(model);
    if (!model.get('_isBranchChild') || !model.get('_isAvailable')) return;
    _.defer(() => this.continue());
  }

  /**
   * Check if, excluding _isTrackable: false elements, that the branching is
   * effectively complete and set completion criteria accordingly.
   * @param {Backbone.model} model
   */
  checkIfIsEffectivelyComplete(model) {
    const blockModel = model.get('_type') === 'component'
      ? model.getParent()
      : model;
    if (!blockModel) return;
    const isBranchChild = blockModel.get('_isBranchChild');
    if (!isBranchChild) return;
    const articleModel = blockModel.getParent();
    const set = this.getSubsetByModelId(articleModel.get('_id'));
    if (!set?.isEffectivelyComplete) return;
    // Allow assessment to complete at the end, before the last trickle button is clicked
    set.enableParentCompletion();
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
