import Adapt from 'core/js/adapt';
import data from 'core/js/data';
import QuestionModel from 'core/js/models/questionModel';
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
  }

  async onAppDataReady() {
    const config = Adapt.course.get('_branching');
    if (!config || !config._isEnabled) return;
    // Wait for all other app:dataReady handlers to finish
    await data.whenReady();
    this.setupBranchingModels();
    this.setupEventListeners();
    Adapt.trigger('branching:dataReady');
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
      containerModel.set({
        // Allow containers to request children at render
        _canRequestChild: true,
        // Prevent default completion
        _requireCompletionOf: Number.POSITIVE_INFINITY
      });
      const children = containerModel.getChildren();
      // Hide all branching container original children as only clones will be displayed
      children.forEach(child => {
        const config = child.get('_branching');
        if (!config || !config._isEnabled) return;
        child.set('_isBranchChild', true);
        child.setOnChildren({ _isAvailable: false });
        const descendants = [child].concat(child.getAllDescendantModels(true));
        // Link all branch questions to their original ids ready for
        // cloning and to facilitate save + restore
        descendants.forEach(descendant => {
          descendant.set('_branchOriginalModelId', descendant.get('_id'));
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

  onAssessmentReset(state) {
    const set = this.getSubsetByModelId(state.articleId);
    if (!set) return;
    set.reset({ removeViews: true });
  }

  async continue() {
    if (this.openPopupCount) {
      this.shouldContinueOnPopupClose = true;
      return;
    }
    await Adapt.parentView.addChildren();
  }

  onComplete(model, value) {
    if (!value) return;
    this.contineAfterBranchChild(model);
    this.saveBranchQuestionAttemptHistory(model);
  }

  contineAfterBranchChild(model) {
    if (!model.get('_isBranchChild')) return;
    this.continue();
  }

  saveBranchQuestionAttemptHistory(model) {
    if (!(model instanceof QuestionModel)) return;
    const branchOriginModelId = model.get('_branchOriginalModelId');
    if (!branchOriginModelId) return;
    const originModel = Adapt.findById(branchOriginModelId);
    originModel.addAttemptObject(model.getAttemptObject());
    Adapt.offlineStorage.save();
  }

}

export default (Adapt.branching = new Branching());
