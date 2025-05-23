# adapt-contrib-branching

**Branching** is an *extension* which is *not* bundled with the [Adapt framework](https://github.com/adaptlearning/adapt_framework).

The **Branching** extension allows an article to contain a series of blocks which branch according to block correctness. It can also be used with blocks that contain presentation components (e.g. [Narrative](https://github.com/adaptlearning/adapt-contrib-narrative)), branching based on completeness instead. Using **Branching**, a course author may create a dynamic experience based upon user responses.

## Installation

* With the [Adapt CLI](https://github.com/adaptlearning/adapt-cli) installed, run the following from the command line:
`adapt install adapt-contrib-branching`

    Alternatively, this extension can also be installed by adding the following line of code to the *adapt.json* file:
    `"adapt-contrib-branching": "*"`
    Then running the command:
    `adapt install`
    (This second method will reinstall all plug-ins listed in *adapt.json*.)

* **Branching** may be installed in the Authoring Tool by uploading the zip.

## Settings Overview

A basic **Branching** configuration would be at the article (*articles.json*) level with branching block children (*blocks.json*).

The attributes listed below are properly formatted as JSON in [*example.json*](https://github.com/adaptlearning/adapt-contrib-branching/blob/master/example.json).

### Attributes

Add to *course.json*:

**\_branching** (object): The branching object contains the following settings:

>**\_isEnabled** (boolean): Turns on and off the **Branching** extension for the entire course.

Add to *articles.json*:

**\_branching** (object): The branching object contains the following settings:

>**\_isEnabled** (boolean): Turns on and off the **Branching** extension for this article.

>**\_start** (string): Defines the starting block for the branching scenario. Leave blank to use the first block.

Add to *blocks.json*:

**\_branching** (object): The branching object contains the following settings:

>**\_isEnabled** (boolean): Turns on and off the **Branching** extension where not required. Useful during course development.

>**\_correct** (string): When the questions contained are all correct and complete, this is the id of the next branching block. Leave this property blank to end the branching scenario. Use this property for blocks that only contain presentation components as the other two correctness options can be ignored.

>**\_partlyCorrect** (string): When the questions contained are partly correct and complete, this is the id of the next branching block. Leave this property blank to end the branching scenario. 

>**\_incorrect** (string): When the questions contained are all incorrect and complete, this is the id of the next branching block. Leave this property blank to end the branching scenario. 

>**\_hasAttemptBands** (boolean): If set to `true`, turns on the **\_attemptBands** behaviour, allowing branching to happen across both attempts and correctness. Otherwise, branching will happen only for correctness. Use only when the block contains question component(s). Defaults to `false`.

>**\_useQuestionAttempts** (boolean): If set to `true`, **\_hasAttemptBands** will branch according to all previous completed attempts at this question, including when the question is shown multiple times in the branching sequence. When `false`, **\_hasAttemptBands** will branch according to the question's own `_attempts` value. Defaults to `false`.

>**\_attemptBands** (object array): Multiple items may be created. Each item represents the branching options for the appropriate range of attempts.

>>**\_attempts** (number): This numeric value represents the start of the range. The range continues to the next highest **\_attempts** of another band.

>>**\_correct** (string): When the questions contained are all correct and complete, this is the id of the next branching block. Leave this property blank to end the branching scenario. 

>>**\_partlyCorrect** (string): When the questions contained are partly correct and complete, this is the id of the next branching block. Leave this property blank to end the branching scenario. 

>>**\_incorrect** (string): When the questions contained are all incorrect and complete, this is the id of the next branching block. Leave this property blank to end the branching scenario. 

## Notes

* All blocks that are part of a branching scenario should have a `_branching` object even if it is empty. For instance, the last block in a branching article can simply use `"_branching": {}` if it should conditionally be shown but does not create any branches of its own. In a branching article, if a particular block does *not* have any `_branching` properties, it will be shown at top of the article, preceding all branching blocks.
* When [**Trickle**](https://github.com/adaptlearning/adapt-contrib-trickle) is enabled on the branching article, no child blocks should disable Trickle. To visually disable Trickle on a branched block, you can modify other Trickle properties (e.g. disable the `_button` or disable `_autoScroll`).
* You may use relative selectors like `@block+1` for the values of **\_correct**, **\_incorrect** and **\_partlyCorrect**. However, this can have unpredictable results when using block randomization in an assessment.
* Spoor [`_shouldStoreAttempts`](https://github.com/adaptlearning/adapt-contrib-spoor#_shouldstoreattempts-boolean) should be set to true to retain the user selections across sessions
* Multiple branching experiences can be used on the same page using multiple articles.

## Limitations

* This extension will not work with legacy versions of Trickle <=4.
* This extension will not work with legacy versions of Assessment <=4.

----------------------------

**Author / maintainer:** Adapt Core Team with [contributors](https://github.com/adaptlearning/adapt-contrib-trickle/graphs/contributors)<br/>
**Accessibility support:** WAI AA<br/>
**RTL support:** Yes<br/>
**Cross-platform coverage:** Chrome, Chrome for Android, Firefox (ESR + latest version), Edge, Safari for macOS/iOS/iPadOS, Opera<br/>
