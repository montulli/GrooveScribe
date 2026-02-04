# README #

Readme for Groove Scribe

### What is this repository for? ###

* Groove Scribe is an HTML application for drummers.    Groove Scribe is a point and click authoring system to create drum sheet music as well as a practice tool for learning and practicing grooves and exercises.

### How do I use it ###

* Hosted here: http://www.mikeslessons.com/gscribe/
* Also here: http://montulli.github.io/GrooveScribe/

### How to run locally ###

Because the application loads external assets (like soundfonts), opening the `index.html` file directly in your browser will result in CORS errors and the audio won't work. You must run it through a local web server.

**Option 1: Python (Recommended for Mac/Linux)**
1. Open your terminal in the project directory.
2. Run: `python3 -m http.server 8000`
3. Open your browser to: [http://localhost:8000](http://localhost:8000)

**Option 2: Node.js (Static Server)**
1. Open your terminal in the project directory.
2. Run: `npx serve`
3. Open the URL provided (usually [http://localhost:3000](http://localhost:3000)).

**Option 3: Node.js (with HOT RELOAD)**
If you want the page to automatically refresh whenever you save a file:
1. Open your terminal in the project directory.
2. Run: `npx browser-sync start --server --files "**/*"`
3. This will open a browser window for you. Any changes to CSS, JS, or HTML files will trigger an instant reload.

### How do I get set up? ###

### Contribution guidelines ###

* Writing tests
* Code review
* Other guidelines

### Who do I talk to? ###

* File issues in github please:   https://github.com/montulli/GrooveScribe/issues
* lou at montulli dot org is the admin and author.   He cannot answer every email, so please use good judgement before emailing.

To edit this Readme:
* [Learn Markdown](https://bitbucket.org/tutorials/markdowndemo)

### See also ###

* [SOURCE_CODE_README.md (Architecture & Source Code)](SOURCE_CODE_README.md)
