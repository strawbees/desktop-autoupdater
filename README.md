# Auto Updater for Strawbees Desktop Apps

Module that orchestrate the auto update process for Strawbees Desktop Apps.

The update process will do the following:

- Retrieve the `latest.json` manifest file from update server
- Compare the latest version with current version
- Create a temporary folder
- Download update to temporary file if it's not downloaded yet
- Move updater binary (generated from [here](https://github.com/Quirkbot/nwjs-autoupdater)) to temporary folder
- Run updater binary

## Installing

Install the auto updater module with `npm install --save @strawbees/desktop-autoupdater`

## Usage

```javascript
const AutoUpdater = require('desktop-autoupdater')
// Current application's package.json
const pkg = require('./package.json')
// Instantiate updater with current package. This package must have the version,
// autoupdate urls for each environment and executable name.
const updater = new AutoUpdater(pkg)
// The update will fire events along the process so the app decide on what to do
updater.addListener('up-to-date', () => {
	console.log('App is up to date')
})
updater.addListener('ready-to-restart', () => {
	console.log('App is ready to restart')
	nw.App.quit()
})
updater.addListener('update-available', () => {
	console.log('Update Available')
})
updater.addListener('error', (err) => {
	console.error('Updater error:', err)
})
// Start the auto update process
updater.start()
```

## TODOs

- Find a way to track the source code that generated the auto updater binary.
