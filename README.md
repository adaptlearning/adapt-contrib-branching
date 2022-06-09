# adapt-contrib-branching

**Branching** is an *extension* which is *not* bundled with the [Adapt framework](https://github.com/adaptlearning/adapt_framework).

The **Branching** extension allows articles to contain a series of blocks which branch according to question answers. Using **Branching**, a course author may create a dynamic experience based upon user responses.

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

- A basic **Branching** configuration would be at the article (*articles.json*) level with branching block children (*blocks.json*). The **\_onChildren** attribute determines the container.

The attributes listed below are properly formatted as JSON in [*example.json*](https://github.com/adaptlearning/adapt-contrib-branching/blob/master/example.json).

### Attributes

**\_branching** (object): The Branching attributes group contains values for **\_isEnabled**, **\_onChildren**, **\_correct**, **\_partlyCorrect**, and **\_incorrect**.

>**\_isEnabled** (boolean):  Turns on and off the **Branching** extension. Can be set in *course.json*, *articles.json* and *blocks.json* to disable **Branching** where not required. Also useful during course development.

>**\_onChildren** (boolean):  If set to `true`, usually on an article, its children will be used for the branching scenario.

>**\_containerId** (string):  To add a block to a alternative branching set, add the branching id here. Leave this blank to use the current parent.

>**\_correct** (string):  When the mandatory questions contained are all correct and complete, this is the id of the next content block.

>**\_partlyCorrect** (string):  When the mandatory questions contained are partly correct and complete, this is the id of the next content block.

>**\_incorrect** (string):  When the mandatory questions contained are all incorrect and complete, this is the id of the next content block.

## Limitations

* This extension will not work with legacy versions of trickle <=4.  
* This extension will not work with legacy versions of assessment <=4.  
* Spoor [`_shouldStoreAttempts`](https://github.com/adaptlearning/adapt-contrib-spoor#_shouldstoreattempts-boolean) should be set to true to retain the user selections across sessions

----------------------------
**Version number:**  0.1.0  <a href="https://community.adaptlearning.org/" target="_blank"><img src="https://github.com/adaptlearning/documentation/blob/master/04_wiki_assets/plug-ins/images/adapt-logo-mrgn-lft.jpg" alt="adapt learning logo" align="right"></a>  
**Framework versions:**  5.7+  
**Author / maintainer:** Adapt Core Team with [contributors](https://github.com/adaptlearning/adapt-contrib-trickle/graphs/contributors)  
**Accessibility support:** WAI AA  
**RTL support:** Yes  
**Cross-platform coverage:** Chrome, Chrome for Android, Firefox (ESR + latest version), Edge, IE11, Safari 12+13 for macOS/iOS/iPadOS, Opera  
