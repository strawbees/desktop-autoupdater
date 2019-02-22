const path = require('path')
const httpServer = require('http')
const httpsServer = require('https')
const os = require('os')
const fs = require('fs')
const childProcess = require('child_process')
const compareVersions = require('./compareVersions')
const Event = require('events')

class AutoUpdater extends Event {
	constructor(pkg, platform, arch) {
		super()
		this.platform = platform || process.platform
		this.arch = arch || process.arch
		// Store the config package
		this.pkg = pkg
		// URI where to find the latest update information
		this.updatesManifestUrl = `${this.pkg.autoupdate}/${this.platform}/${this.arch}/latest.json`
		// URI where the updates will be or have been downloaded
		this.tempFolder = path.resolve(os.tmpdir(), pkg['executable-name'])
		// Updater binary name
		this.updaterBinName = `autoupdater-${this.arch}${/^win/.test(this.platform) ? '.exe' : ''}`
		// Path of temporary file while downloading update source
		this.updateTempDest = path.resolve(this.tempFolder, '.update.zip')
		// Path of final file when finishd downloading update source
		this.updateFinalDest = null
	}

	log(...args) {
		console.log('UPDATER:', ...args)
	}

	async start() {
		this.log('Starting')
		try {
			// Grab manifest file
			let manifest = await this.getManifest()
			// Set path where fully downloaded update source should be
			this.updateFinalDest = path.resolve(
				this.tempFolder, `${manifest.version}.zip`
			)
			if (!this.hasUpdate(manifest)) {
				this.log('App is up to date')
				this.emit('up-to-date')
				return
			}
			await this.makeTempDirectory()
			// Check if there is something downloaded already
			if (await this.hasUpdateDownloaded()) {
				this.log('Update is already downloaded')
				await this.prepareToRestart()
				this.emit('ready-to-restart')
				return
			}
			this.log('Update is not downloaded')
			// Clean previous temporary download file
			await this.clearTempDownload()
			// Download update
			await this.downloadUpdate(manifest)
			this.emit('update-available')
		} catch(err) {
			this.emit('error', err)
		}
	}

	async prepareToRestart() {
		await this.copyUpdaterBinaryToTemp()
		await this.runUpdaterBinary()
	}

	async getManifest() {
		this.log('getting manifest at:', this.updatesManifestUrl)
		return (await fetch(`${this.updatesManifestUrl}?${Date.now()}`)).json()
	}

	hasUpdate(manifest) {
		this.log('comparing:', this.pkg.version, '/', manifest.version)
		// if current version is smaller than manifest version
		return (compareVersions(this.pkg.version, manifest.version) < 0)
	}

	async makeTempDirectory() {
		this.log('making temporary directory:', this.tempFolder)
		return fs.promises.mkdir(this.tempFolder, { recursive : true })
	}

	async clearTempDownload() {
		this.log('cleaning temporary download file:', this.updateTempDest)
		return fs.promises.unlink(this.updateTempDest)
			.catch((err) => {
				this.log('No temporary download file found')
			})
	}

	async hasUpdateDownloaded() {
		this.log('checking if there is an update downloaded at:', this.updateFinalDest)
		return fs.promises.access(this.updateFinalDest)
			.then(() => true)
			.catch(() => false)
	}

	async downloadUpdate(manifest) {
		const sourceUrl = `${this.pkg.autoupdate}/${this.platform}/${this.arch}/${manifest.src.path}`
		this.log('downloading update from:', sourceUrl)
		return new Promise((resolve, reject) => {
			const http = /^https/.test(sourceUrl) ? httpsServer : httpServer
			http.get(sourceUrl, res => {
				if (res.statusCode !== 200) {
					return reject(new Error(res.statusMessage))
				}
				res.pipe(fs.createWriteStream(this.updateTempDest))
					.on('finish', async () => {
						// rename temp file to final filename
						this.log('update downloaded')
						this.log('renaming temp file to final path')
						fs.promises.rename(
							this.updateTempDest, this.updateFinalDest
						).then(resolve)
						.catch(reject)
					})
					.on('error', err => reject(err))
				return null
			})
		})
	}

	async copyUpdaterBinaryToTemp() {
		return new Promise((resolve, reject) => {
			this.log('copying updater to temporary folder:', this.updaterBinName, '->', this.tempFolder)
			fs.promises.copyFile(
				path.resolve(__dirname, `updater/${this.platform}/`, this.updaterBinName),
				path.resolve(this.tempFolder, this.updaterBinName)
			)
			.then(() => {
				this.log('changing updater permisions:', path.resolve(this.tempFolder, this.updaterBinName))
				return fs.promises.chmod(
					path.resolve(this.tempFolder, this.updaterBinName),
					755 & ~process.umask()
				)
			})
			.then(resolve)
			.catch(reject)
		})
	}

	async runUpdaterBinary() {
		this.log('running update binary')
		let instDir
		switch (this.platform) {
			case 'darwin':
				instDir = path.resolve('./../../../../')
				break
			case 'win32':
			case 'linux':
				instDir = path.resolve('./')
				break
			default:
				break
		}
		const args = [
			path.resolve(this.tempFolder, this.updaterBinName),
			[
				'--bundle', path.resolve(this.updateFinalDest),
				'--inst-dir', instDir,
				'--app-name', this.pkg['executable-name'],
				'--wait', process.pid
			],
			{
				cwd      : this.tempFolder,
				detached : true,
				stdio    : 'ignore',
			}
		]
		this.log('arguments', args)
		this.log('spawning child process')
		childProcess.spawn.apply(this, args).unref()
	}
}

module.exports = AutoUpdater
