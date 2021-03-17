import data from 'core/js/data';

/**
* Fetch an array representing the relative location of the model to the nearest _trackingId
* @returns {Array<Number, Number>}
*/
export function getTrackingPosition(model) {
  const firstDescendant = model.getAllDescendantModels(false).concat([model])[0];
  const nearestTrackingIdModel = [firstDescendant].concat(firstDescendant.getAncestorModels()).find(model => model.has('_trackingId'));
  if (!nearestTrackingIdModel) return;
  const trackingId = nearestTrackingIdModel.get('_trackingId');
  const trackingIdDescendants = [nearestTrackingIdModel].concat(nearestTrackingIdModel.getAllDescendantModels(true));
  const indexInTrackingIdDescendants = trackingIdDescendants.findIndex(descendant => descendant === model);
  if (indexInTrackingIdDescendants >= 0) {
    // Is either the nearestTrackingIdModel (0) or one of its flattened descendants (>0)
    return [ trackingId, indexInTrackingIdDescendants ];
  }
  // Is an ancestor of the nearestTrackingIdModel
  const trackingIdAncestors = nearestTrackingIdModel.getAncestorModels();
  const ancestorDistance = trackingIdAncestors.findIndex(ancestor => ancestor === model);
  return [ trackingId, -(ancestorDistance + 1) ];
}

/**
 * Returns the model represented by the trackingPosition.
 * @param {Array<Number, Number>} trackingPosition Represents the relative location of a model to a _trackingId
 * @returns {Backbone.Model}
 */
export function findByTrackingPosition(trackingPosition) {
  const [ trackingId, indexInTrackingIdDescendants ] = trackingPosition;
  const trackingIdModel = data.find(model => model.get('_trackingId') === trackingId);
  if (!trackingIdModel) {
    console.warn(`Adapt.findByTrackingPosition() unable to find trackingPosition: ${trackingPosition}`);
    return;
  }
  if (indexInTrackingIdDescendants >= 0) {
    // Model is either the trackingId model or a descendant
    const trackingIdDescendants = [trackingIdModel].concat(trackingIdModel.getAllDescendantModels(true));
    return trackingIdDescendants[indexInTrackingIdDescendants];
  }
  // Model is an ancestor of the trackingId model
  const trackingIdAncestors = trackingIdModel.getAncestorModels();
  const ancestorDistance = Math.abs(indexInTrackingIdDescendants) - 1;
  return trackingIdAncestors[ancestorDistance];
}
