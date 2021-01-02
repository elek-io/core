# elek.io
elek.io is a CMS and static page generator that allows content editors to work easily on their own local maschines. Theme authors to adapt without frustration and restrict how their theme is used. Corporations to integrate their own workflows and benefit from minimal cost, enhanced security, stability and performance.

## How it works
One of the core ideas of elek.io is, that your data belongs to you. With elek.io you are not forced to use a paid plan to be able to edit and manage your websites. There a quite a few solutions that do similar things, but as far as I know there is none that allows you to do it without being sucked into an ecosystem.

To accomplish this goal, we've gone another route than most these days. Where others require you to sign up and use a most often closed source SAAS application, elek.io tries to avoid that whereever possible and uses open source software that you can download on your computer, to use without registration or paid plans to edit and manage your websites.

That being said, like other open source software we will offer services around the client to close gaps of functionality and make using elek.io even more fun to use. But in the end the user still decides if maybe another service will be more suited to him. Feel free to host your repository on GitHub and the website's content on Netlify. We're happy if you are happy to use our free and open source client.

## How to edit your content
elek.io currently knows three forms of content:

1. blocks - Inside a block you can use Markdown to write articles with images, links and more. You are free to input anything, as long as the author of the theme did not retrict you to use only some of Markdown's features. But more on that later.
2. elements - An element is a single HTML element like a heading or an image where you choose what to write into that heading or which image to use. The type of element (e.g. header or image) stays the same and is not changeable for the editor.
3. components - A component is a custom element which is defined through the theme you use. Different themes allow you to use different components. 

## Opinionated content management
As written above, elek.io limits what content editors can and can not do inside all of it's content. This is by design. elek.io is not a page builder where themes can be used in ways the theme author did not intended. The author of the theme decides for each form of content what editors are allowed to do here, so he can programmatically react to it.

This results in beautiful websites, that look and are used the way the author of it's theme wanted to. No more overflowing of text, no more multiple different fonts, colors and sizes.

## Content workflows


## Simplicity


## Technologies
- Node.js runtime
- electron.js for the client
- TypeScript as the primary language
- Git for version control