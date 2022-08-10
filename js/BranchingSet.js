import Adapt from 'core/js/adapt';
import data from 'core/js/data';
import ComponentModel from 'core/js/models/componentModel';
import {
  getCorrectness
} from './correctness';
import offlineStorage from 'core/js/offlineStorage';

/** @typedef {import("core/js/models/adaptModel").default} AdaptModel */

export default class BranchingSet {

  constructor(options = {}) {
    /** @type {AdaptModel} */
    this.model = options.model;
    this.setupModels();
  }

  setupModels() {
    const containerId = this.model.get('_id');
    const children = [
      ...this.model.getChildren(),
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
  }

  initialize() {
    this._wasInitialized = true;
    this.disableParentCompletion();
    const wasRestored = this.restore();
    if (wasRestored) {
      // Check if the next model needs loading, this will happen if the previous
      // item was completed in a previous session and before the next item has loaded,
      // such as when a trickle button is enabled but not yet clicked
      const nextModel = this.getNextModel();
      if (typeof nextModel !== 'object') return;
      this.addNextModel(nextModel, true, false, true);
      return;
    }
    this.addFirstModel();
  }

  disableParentCompletion() {
    this.model.set({
      _canRequestChild: true,
      _requireCompletionOf: Number.POSITIVE_INFINITY
    });
  }

  enableParentCompletion() {
    this.model.set('_requireCompletionOf', -1);
    // Synchronously check completion, this.model.checkCompletionStatus is async
    Adapt.checkingCompletion();
    this.model.checkCompletionStatusFor('_isComplete');
    Adapt.checkingCompletion();
    this.model.checkCompletionStatusFor('_isInteractionComplete');
  }

  get startId() {
    return this.model.get('_branching')?._start;
  }

  set startId(modelId) {
    const config = this.model.get('_branching');
    if (!config) return;
    config._start = modelId;
  }

  checkResetOnStartChange() {
    const config = this.model.get('_branching');
    if (!config._start) return;
    const isAtCorrectStart = (this.isAtStart && this.branchedModels[0]?.get('_branchOriginalModelId') === config._start);
    if (isAtCorrectStart || !this.isAtStart || this.isAtEnd) return;
    this.reset({ removeViews: true });
  }

  restore() {
    const branching = offlineStorage.get('b');
    if (!branching) return;
    const id = this.model.get('_id');
    if (!branching[id]) return;
    const trackingPositions = offlineStorage.deserialize(branching[id]);
    trackingPositions.forEach((trackingPosition, index) => {
      const isLast = (index === trackingPositions.length - 1);
      const model = data.findByTrackingPosition(trackingPosition);
      this.addNextModel(model, false, true, isLast);
    });
    if (this.isAtEnd) {
      this.enableParentCompletion();
    }
    return true;
  }

  addFirstModel() {
    // Find and add the first child if the container was not restored
    const model = this.getNextModel();
    this.addNextModel(model, true, false);
  }

  getNextModel({ isTheoretical = false } = {}) {
    const config = this.model.get('_branching');
    const brachingModels = this.models;
    const branchedModels = this.branchedModels;

    const isBeforeStart = !branchedModels.length;
    if (isBeforeStart) {
      const hasStartId = Boolean(config._start);
      const firstModel = hasStartId ?
        brachingModels.find(model => model.get('_id') === config._start) :
        brachingModels[0];
      return firstModel;
    }

    const lastChildModel = branchedModels[branchedModels.length - 1];
    const isLastIncomplete = !lastChildModel.get('_isComplete') && !lastChildModel.get('_isOptional');
    if (isLastIncomplete && !isTheoretical) {
      return false;
    }

    const lastChildConfig = lastChildModel.get('_branching');
    if (!lastChildConfig || !lastChildConfig._isEnabled) return true;

    // Branch from the last model's correctness, if configured
    const correctness = getCorrectness(lastChildModel);
    const nextId = lastChildConfig._force || lastChildConfig[`_${correctness}`];
    if (!nextId) return true;

    function findNextModel(nextId) {
      const isRelativeId = nextId.includes('@');
      if (!isRelativeId) {
        return brachingModels.find(model => model.get('_id') === nextId);
      }
      const originalLastChildModel = data.findById(lastChildModel.get('_branchOriginalModelId'));
      const nextModel = originalLastChildModel.findRelativeModel(nextId);
      const wasModelAlreadyUsed = nextModel.get('_isAvailable');
      if (wasModelAlreadyUsed) return true;
      return nextModel;
    }

    const nextModel = findNextModel(nextId);
    // Mark as finished
    if (nextModel === true) return true;
    if (nextModel === undefined) {
      // Set the start block of a different branching set
      const nextBranchingSet = Adapt.branching.getSubsetByModelId(nextId);
      if (!nextBranchingSet) throw new Error(`Cannot branch to a model that isn't contained in a branching set: ${nextId} from ${lastChildModel.get('_id')}`);
      if (!isTheoretical) nextBranchingSet.startId = nextId;
      // Mark as finished
      return true;
    }
    // Provide the next model
    return nextModel;
  }

  addNextModel(nextModel, shouldSave = true, shouldRestore = false, isLast = true) {
    // Clear the set's current back() position
    this.model.set({
      _branchLastPreviousIndex: null
    });
    // Increment the original model's attempts
    const attemptIndex = (nextModel.get('_branchAttempts') || 0);
    nextModel.set('_branchAttempts', attemptIndex + 1);
    let isAnyPartRestored = false;
    const cloned = nextModel.deepClone((clone, model) => {
      clone.set({
        _id: `${model.get('_id')}_branching_${attemptIndex}`, // Replicable ids for bookmarking
        _isAvailable: true,
        _isBranchClone: true
      });
      if (model === nextModel) {
        clone.set('_parentId', this.model.get('_id'));
      }
      // Remove tracking ids as these will change depending on the branches
      // Clone attempt states are stored on the original model in their order of occurance
      if (clone.has('_trackingId')) {
        clone.unset('_trackingId');
      }
      if (clone instanceof ComponentModel) {
        // Clear clone response history
        clone.set('_attemptStates', false);
        if (shouldRestore) {
          // Restore the attempt state from the original model in occurance order
          const attemptObjects = model.getAttemptObjects();
          const hasAttemptRecord = (attemptObjects.length && attemptObjects[attemptIndex]);
          if (hasAttemptRecord) {
            clone.set(attemptObjects[attemptIndex]);
            isAnyPartRestored = true;
            return;
          }
          // If the clone is in the middle of a branching and does not have an
          // attempt record, then the save must have failed or be missing
          if (!isLast) {
            clone.setCompletionStatus();
            isAnyPartRestored = true;
          }
        }
      }
      // Reset if not restored or not a component
      clone.reset('hard', true);
    });
    if (isAnyPartRestored) {
      // Make sure to explicitly set the block to complete if complete
      // This helps trickle setup locking correctly
      const areAllDescendantsComplete = cloned.getAllDescendantModels(true).every(model => model.get('_isComplete') || model.get('_isOptional'));
      if (areAllDescendantsComplete) {
        cloned.setCompletionStatus();
      }
    }
    if (shouldSave) {
      this.saveNextModel(nextModel);
    }
    return cloned;
  }

  /**
   * @param {AdaptModel} nextModel
   */
  saveNextModel(nextModel) {
    const branching = offlineStorage.get('b') || {};
    const id = this.model.get('_id');
    const trackingIds = (branching[id] && offlineStorage.deserialize(branching[id])) || [];
    trackingIds.push(nextModel.trackingPosition);
    branching[id] = offlineStorage.serialize(trackingIds);
    offlineStorage.set('b', branching);
  }

  get models() {
    const containerId = this.model.get('_id');
    return data.filter(model => {
      if (model.get('_isBranchClone')) return false;
      const config = model.get('_branching');
      if (!config || config._isEnabled === false) return false;
      return (config._containerId === containerId);
    });
  }

  get branchedModels() {
    const containerId = this.model.get('_id');
    return data.filter(model => {
      if (!model.get('_isBranchClone')) return false;
      const config = model.get('_branching');
      if (!config || config._isEnabled === false) return false;
      return (config._containerId === containerId);
    });
  }

  get isAtStart() {
    const branchedModels = this.branchedModels;
    const firstChild = branchedModels[0];
    const lastChild = branchedModels[branchedModels.length - 1];
    return (firstChild === lastChild);
  }

  get isEffectivelyComplete() {
    const isEffectivelyComplete = this.branchedModels.every(childModel => {
      const requireCompletionOf = childModel.get('_requireCompletionOf');
      const hasStandardCompletionCriteria = (requireCompletionOf !== -1);
      if (hasStandardCompletionCriteria) return false;
      // Excludes non-trackable extension components, like trickle buttons
      const areAllAvailableTrackableChildrenComplete = childModel.getChildren()
        .filter(model => model.get('_isAvailable') && model.get('_isTrackable'))
        .every(model => model.get('_isComplete') || model.get('_isOptional'));
      return areAllAvailableTrackableChildrenComplete;
    });
    return isEffectivelyComplete && this.isAtEnd;
  }

  get isAtEnd() {
    return (this.getNextModel({ isTheoretical: true }) === true);
  }

  async reset({ removeViews = false } = {}) {
    if (this._isInReset || !this._wasInitialized) return;
    this._isInReset = true;
    this.disableParentCompletion();
    const parentView = data.findViewByModelId(this.model.get('_id'));
    const childViews = parentView?.getChildViews();
    const branchedModels = this.branchedModels;
    branchedModels.forEach(model => {
      if (Adapt.parentView && removeViews) {
        const view = data.findViewByModelId(model.get('_id'));
        if (view) {
          view.remove();
          childViews.splice(childViews.findIndex(v => v === view), 1);
          parentView.nthChild--;
        }
      }
      data.remove(model);
    });
    if (removeViews) parentView?.setChildViews(childViews);
    this.model.getChildren().remove(branchedModels);
    this.model.findDescendantModels('component').forEach(model => model.set('_attemptStates', []));
    const branching = offlineStorage.get('b') || {};
    const id = this.model.get('_id');
    const trackingIds = [];
    branching[id] = offlineStorage.serialize(trackingIds);
    offlineStorage.set('b', branching);
    this.addFirstModel();
    await Adapt.parentView?.addChildren();
    Adapt.checkingCompletion();
    this.model.checkCompletionStatusFor('_isComplete');
    this._isInReset = false;
    return true;
  }

}
