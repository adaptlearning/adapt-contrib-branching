import Adapt from 'core/js/adapt';
import data from 'core/js/data';
import QuestionModel from 'core/js/models/questionModel';
import {
  getTrackingPosition,
  findByTrackingPosition
} from './trackingPosition';
import {
  getCorrectness
} from './correctness';

/** @typedef {import("core/js/models/adaptModel").default} AdaptModel */

export default class BranchingSet {

  constructor(options = {}) {
    /** @type {AdaptModel} */
    this.model = options.model;
    const wasRestored = this.restore();
    if (!wasRestored) this.addFirstModel();
  }

  restore() {
    const branching = Adapt.offlineStorage.get('b');
    if (!branching) return;
    const id = this.model.get('_id');
    if (!branching[id]) return;
    const trackingPositions = Adapt.offlineStorage.deserialize(branching[id]);
    trackingPositions.forEach(trackingPosition => {
      const model = findByTrackingPosition(trackingPosition);
      this.addNextModel(model, false, true);
    });
    return true;
  }

  addFirstModel() {
    // Find and add the first child if the container was not restored
    const model = this.getNextModel();
    this.addNextModel(model, true, false); // BUG?: check change to flag works
  }

  getNextModel() {
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
    const isLastIncomplete = !lastChildModel.get('_isComplete');
    if (isLastIncomplete) {
      return false;
    }

    const lastChildConfig = lastChildModel.get('_branching');
    if (!lastChildConfig || !lastChildConfig._isEnabled) return true;

    // Branch from the last model's correctness, if configured
    const correctness = getCorrectness(lastChildModel);
    const nextId = lastChildConfig._force || lastChildConfig[`_${correctness}`];
    if (!nextId) return true;

    const isRelativeId = nextId.includes('@');
    if (!isRelativeId) {
      return brachingModels.find(model => model.get('_id') === nextId) || true;
    }

    const originalLastChildModel = Adapt.findById(lastChildModel.get('_branchOriginalModelId'));
    const nextModel = originalLastChildModel.findRelativeModel(nextId);
    const wasModelAlreadyUsed = nextModel.get('_isAvailable');
    if (wasModelAlreadyUsed) return true;
    return nextModel;
  }

  addNextModel(nextModel, shouldSave = true, shouldRestore = false) {
    // Clear the set's current back() position
    this.model.set({
      _branchLastPreviousIndex: null
    });
    // Increment the original model's attempts
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
      }
      // Reset if not restored or not a question
      clone.reset('hard', true);
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
    if (shouldSave) {
      this.saveNextModel(nextModel);
    }
    return cloned;
  }

  saveNextModel(nextModel) {
    const branching = Adapt.offlineStorage.get('b') || {};
    const id = this.model.get('_id');
    const trackingIds = (branching[id] && Adapt.offlineStorage.deserialize(branching[id])) || [];
    trackingIds.push(getTrackingPosition(nextModel));
    branching[id] = Adapt.offlineStorage.serialize(trackingIds);
    Adapt.offlineStorage.set('b', branching);
  }

  get models() {
    return this.model.getChildren().filter(model => {
      if (model.get('_isAvailable')) return false;
      const config = model.get('_branching');
      return (config && config._isEnabled !== false);
    });
  }

  get branchedModels() {
    return this.model.getChildren().filter(model => {
      if (!model.get('_isAvailable')) return false;
      const config = model.get('_branching');
      return (config && config._isEnabled !== false);
    });
  }

  get isAtStart() {
    const branchedModels = this.branchedModels;
    const firstChild = branchedModels[0];
    const lastChild = branchedModels[branchedModels.length - 1];
    return (firstChild === lastChild);
  }

  get canReset() {
    return !this.isAtStart;
  }

  async reset({ removeViews = false } = {}) {
    if (!this.canReset) return false;
    this.model.set('_requireCompletionOf', Number.POSITIVE_INFINITY);
    const branchedModels = this.branchedModels;
    branchedModels.forEach(model => {
      if (Adapt.parentView && removeViews) {
        const view = Adapt.findViewByModelId(model.get('_id'));
        view && view.remove();
      }
      data.remove(model);
    });
    this.model.getChildren().remove(branchedModels);
    this.model.findDescendantModels('question').forEach(model => model.set('_attemptStates', []));
    const branching = Adapt.offlineStorage.get('b') || {};
    const id = this.model.get('_id');
    const trackingIds = [];
    branching[id] = Adapt.offlineStorage.serialize(trackingIds);
    Adapt.offlineStorage.set('b', branching);
    await Adapt.parentView?.addChildren();
    return true;
  }

}
