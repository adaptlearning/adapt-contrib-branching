import { describe, whereContent, whereFromPlugin, mutateContent, checkContent, updatePlugin } from 'adapt-migrations';
import _ from 'lodash';

describe('Branching - v1.0.1 to v1.0.3', async () => {

  // https://github.com/adaptlearning/adapt-contrib-branching/compare/v1.0.1..v1.0.3

  // note https://github.com/adaptlearning/adapt-contrib-branching/compare/v1.0.2..v1.0.3
  // _start was misplaced, but this only occurred for 30 mins so it will be ignored

  let configuredArticles;

  whereFromPlugin('Branching - from v1.0.1', { name: 'adapt-contrib-branching', version: '<1.0.3' });

  whereContent('Branching - where branching configured on articles', async (content) => {
    configuredArticles = content.filter(({ _type, _branching }) => _type === 'article' && _branching);
    return configuredArticles.length;
  });

  mutateContent('Branching - add _start attribute with default value', async (content) => {
    configuredArticles.forEach(article => (article._branching._start = ''));
    return true;
  });

  checkContent('Branching - check _start attribute', async (content) => {
    const isValid = configuredArticles.every(article => article._branching._start === '');
    if (!isValid) throw new Error('Branching - article attribute _start');
    return true;
  });

  updatePlugin('Branching - update to v1.0.3', { name: 'adapt-contrib-branching', version: '1.0.3', framework: '">=5.19.1' });
});

describe('Branching - v1.0.3 to v1.1.0', async () => {

  // https://github.com/adaptlearning/adapt-contrib-branching/compare/v1.0.3..v1.1.0

  let configuredBlocks;

  whereFromPlugin('Branching - from v1.0.3', { name: 'adapt-contrib-branching', version: '<1.1.0' });

  whereContent('Branching - where branching configured on blocks', async (content) => {
    configuredBlocks = content.filter(({ _type, _branching }) => _type === 'block' && _branching);
    return configuredBlocks.length;
  });

  mutateContent('Branching - remove _isEnabled attribute', async (content) => {
    configuredBlocks.forEach(block => (delete block._branching._isEnabled));
    return true;
  });

  checkContent('Branching - check _isEnabled attribute', async (content) => {
    const isValid = configuredBlocks.every(block => !_.has(block._branching, '_isEnabled'));
    if (!isValid) throw new Error('Branching - block attribute _isEnabled');
    return true;
  });

  updatePlugin('Branching - update to v1.1.0', { name: 'adapt-contrib-branching', version: '1.1.0', framework: '">=5.19.1' });
});

describe('Branching - v1.1.2 to v1.2.0', async () => {

  // https://github.com/adaptlearning/adapt-contrib-branching/compare/v1.1.2..v1.2.0

  let configuredBlocks;
  const attemptBands = [{
    _attempts: 1,
    _correct: '',
    _incorrect: '',
    _partlyCorrect: ''
  }];

  whereFromPlugin('Branching - from v1.1.2', { name: 'adapt-contrib-branching', version: '<1.2.0' });

  whereContent('Branching - where branching configured on blocks', async (content) => {
    configuredBlocks = content.filter(({ _type, _branching }) => _type === 'block' && _branching);
    return configuredBlocks.length;
  });

  mutateContent('Branching - add _hasAttemptBands attribute with default value', async (content) => {
    configuredBlocks.forEach(block => (block._branching._hasAttemptBands = false));
    return true;
  });

  mutateContent('Branching - add _useQuestionAttempts attribute with default value', async (content) => {
    configuredBlocks.forEach(block => (block._branching._useQuestionAttempts = false));
    return true;
  });

  mutateContent('Branching - add _attemptBands attribute with default value', async (content) => {
    configuredBlocks.forEach(block => (block._branching._attemptBands = attemptBands));
    return true;
  });

  checkContent('Branching - check _hasAttemptBands attribute', async (content) => {
    const isValid = configuredBlocks.every(block => block._branching._hasAttemptBands === false);
    if (!isValid) throw new Error('Branching - block attribute _hasAttemptBands');
    return true;
  });

  checkContent('Branching - check _useQuestionAttempts attribute', async (content) => {
    const isValid = configuredBlocks.every(block => block._branching._useQuestionAttempts === false);
    if (!isValid) throw new Error('Branching - block attribute _useQuestionAttempts');
    return true;
  });

  checkContent('Branching - check _attemptBands attribute', async (content) => {
    const isValid = configuredBlocks.every(block => _.isEqual(block._branching._attemptBands, attemptBands));
    if (!isValid) throw new Error('Branching - block attribute _attemptBands');
    return true;
  });

  updatePlugin('Branching - update to v1.2.0', { name: 'adapt-contrib-branching', version: '1.2.0', framework: '">=5.19.1' });
});

describe('Branching - v1.2.3 to v1.3.0', async () => {

  // https://github.com/adaptlearning/adapt-contrib-branching/compare/v1.2.3..v1.3.0

  let configuredBlocks;

  whereFromPlugin('Branching - from v1.2.3', { name: 'adapt-contrib-branching', version: '<1.3.0' });

  whereContent('Branching - where branching configured on blocks', async (content) => {
    configuredBlocks = content.filter(({ _type, _branching }) => _type === 'block' && _branching);
    return configuredBlocks.length;
  });

  mutateContent('Branching - remove _containerId attribute', async (content) => {
    configuredBlocks.forEach(block => (delete block._branching._containerId));
    return true;
  });

  checkContent('Branching - check _containerId attribute', async (content) => {
    const isValid = configuredBlocks.every(block => !_.has(block._branching, '_containerId'));
    if (!isValid) throw new Error('Branching - block attribute _containerId');
    return true;
  });

  updatePlugin('Branching - update to v1.3.0', { name: 'adapt-contrib-branching', version: '1.3.0', framework: '">=5.19.1' });
});
