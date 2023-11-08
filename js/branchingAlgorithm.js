import QuestionModel from 'core/js/models/questionModel';
import data from 'core/js/data';

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
  const useQuestionAttempts = Boolean(model.get('_branching')?._useQuestionAttempts);
  const questionModels = model.getAllDescendantModels().concat([model]).filter(model => model instanceof QuestionModel);
  if (useQuestionAttempts) {
    function getOriginalModelAttemptsTaken(questionModel) {
      const originalModel = data.findById(questionModel.get('_branchOriginalModelId'));
      const attemptObjects = originalModel.getAttemptObjects();
      return attemptObjects.length;
    }
    const attemptsTaken = questionModels.reduce((sum, questionModel) => sum + getOriginalModelAttemptsTaken(questionModel), 0);
    return attemptsTaken;
  }
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
