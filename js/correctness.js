import QuestionModel from 'core/js/models/questionModel';

export function getCorrectness(model) {
  const questionModels = model.getAllDescendantModels().concat([model]).filter(model => model instanceof QuestionModel);
  const numberOfCorrect = (questionModels.filter(child => (child.isCorrect()) && !child.get('_isOptional'))).length;
  const numberOfPartlyCorrect = (questionModels.filter(child => (child.isPartlyCorrect()) && !child.get('_isOptional'))).length;
  const isCorrect = questionModels.every(child => child.isCorrect() || child.get('_isOptional'));
  const isPartlyCorrect = (numberOfCorrect > 0) || (numberOfPartlyCorrect > 0);
  return isCorrect ?
    'correct' :
    isPartlyCorrect ?
      'partlyCorrect' :
      'incorrect';
}
