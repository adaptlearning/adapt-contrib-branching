import QuestionModel from 'core/js/models/questionModel';

export function getCorrectness(model) {
  const questionModels = model.getAllDescendantModels().concat([model]).filter(model => model instanceof QuestionModel);
  const numberOfCorrect = (questionModels.filter(child => (child.isCorrect()) && !child.get('_isOptional'))).length;
  const numberOfPartlyCorrect = (questionModels.filter(child => (child.isPartlyCorrect()) && !child.get('_isOptional'))).length;
  const isCorrect = questionModels.every(child => child.isCorrect() || child.get('_isOptional'));
  const isPartlyCorrect = (numberOfCorrect > 0) || (numberOfPartlyCorrect > 0);
  const correctnessState = isCorrect ?
    'correct' :
    isPartlyCorrect ?
      'partlyCorrect' :
      'incorrect';
  return correctnessState;
}

export function getAttemptsTaken(model) {
  const questionModels = model.getAllDescendantModels().concat([model]).filter(model => model instanceof QuestionModel);
  const attemptsPossible = questionModels.reduce((sum, questionModel) => sum + questionModel.get('_attempts'), 0);
  const attemptsLeft = questionModels.reduce((sum, questionModel) => sum + (questionModel.get('_attemptsLeft') ?? questionModel.get('_attempts')), 0);
  const attemptsTaken = (attemptsPossible - attemptsLeft);
  return attemptsTaken;
}

export function getNextId(model) {
  const config = model.get('_branching');
  if (config._force) return config._force;
  const correctness = getCorrectness(model);
  const hasAttemptBands = Boolean(config?._hasAttemptBands ?? false);
  if (!hasAttemptBands) return config[`_${correctness}`];
  const attemptsTaken = getAttemptsTaken(model);
  const attemptBands = config._attemptBands || [];
  attemptBands.sort((a, b) => a._attempts - b._attempts);
  const attemptBand = attemptBands
    .slice(0)
    .reverse()
    .reduce((found, band) => {
      if (found) return found;
      if (band._attempts > attemptsTaken) return null;
      return band;
    }, null);
  const hasAttemptBand = Boolean(attemptBand);
  if (hasAttemptBands && hasAttemptBand) {
    // Branch from last model's attemptBand correctness, if configured
    return attemptBand[`_${correctness}`];
  }
  // Branch from the last model's correctness, if configured
  return config[`_${correctness}`];
}
