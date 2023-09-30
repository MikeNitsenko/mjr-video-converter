# TSA Videocall Converter

## How to run
- install latest Node.JS
- download `FFMPEG` with `FFPROBE`
- clone repo and create separate branch
- run `npm istall` to install all dependencies from `package.json`
- check `config.js` and set up all paths accordingly
- run `npm start` to start project

## Usage
Navigate to http://127.0.0.1:5000/static/player.html?room={roomId} to open player.

Swap **{roomId}** with actual room id. You should have folder with according name in your `videosBaseDir` from `config.js`

- conversion process will start
- player will show you the progress of conversion
- if conversion will fail - player will try to show you preliminary results
- if converstion will succeed - player will load ready video