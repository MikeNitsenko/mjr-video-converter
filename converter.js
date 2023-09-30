const express = require('express');
const cors = require('cors')
const app = express();
const port = 5000;
const Queue = require('bull');
const config = require('./config');
const FileUtils = require('./tools/file-utils');
const pjson = require('./package.json');
const url = require('url');
const monitoro = require('monitoro');

// Initialize Bull
const videoQueue = new Queue('video converter');
videoQueue.process(__dirname + '/tools/processor.js');

// CORS
app.use(cors());

// Enable Bull's monitoring
const queueConfigArray = [{ name: "video converter", url: "redis://127.0.0.1:6379" }];
app.locals.MonitoroQueues = queueConfigArray;
app.use('/monitor', monitoro);

// Serve static files for player
app.use('/static', express.static(__dirname + '/public'));
app.use('/files', express.static(config.videosBaseDir)); 

/**
 * Run converter
 */
app.get('/videos/:id', async (req, res) => {

    let { id } = req.params;
    let { priority } = url.parse(req.url, true).query;
    console.log(`DIRECTORY: ${id}`, 'PRIORITY:', priority);

    let files = await FileUtils.getFilesForMixing(id).catch((err) => {
        res.json({ error: err });
    });

    let job = await videoQueue.add({ id, files }, { priority: priority || 0 });
    res.json({ jobId: job.id });
})

/**
 * Get processed files
 */
app.get('/videos/:id/processed', async (req, res) => {

    let id = req.params.id;
    console.log(`DIRECTORY: ${id}`);

    let files = await FileUtils.checkForProcessedFile(id).catch((err) => {
        res.json({ error: err });
    });

    res.json(files);
})

/**
 * Get mixed files
 */
app.get('/videos/:id/mixed', async (req, res) => {

    let id = req.params.id;
    console.log(`DIRECTORY: ${id}`);

    let files = await FileUtils.getMixedFiles(id).catch((err) => {
        res.json({ error: err });
    });

    res.json(files);
})

/** 
 * Allows the client to query the state of a background job
 */ 
app.get('/job/:id', async (req, res) => {
    let id = req.params.id;
    let job = await videoQueue.getJob(id);

    if (job === null) {
        res.status(404).end();
    } else {

        const waiting = await videoQueue.getWaiting();
        let position = 0;
        for (let i = 0; i < waiting.length; i++) {
            const job = waiting[i];
            if (job.id === id) {
                position = i + 1; // 0 means job is 1st in queue
                break;
            }
        }

        let state = await job.getState();
        let progress = job._progress;
        let reason = job.failedReason;
        res.json({ id, state, progress, reason, position });
    }
});

/**
 * Get application's config file contents
 */
app.get('/config', (req, res) => {
    res.json(config);
});

/**
 * Get app's version from package.json
 */
app.get('/version', (req, res) => {
    res.json({ version: pjson.version } );
});

// You can listen to global events to get notified when jobs are processed
videoQueue.on('global:completed', async (jobId, result) => {
    console.log(`Job [${jobId}] completed with result ${result}`);
    const job = await videoQueue.getJob(jobId);
    console.log(job.data.id);
});

// App starting point
app.listen(port, () => {
    console.log(`::: TSA Videocall Converter started | http://127.0.0.1:${port} | ${new Date()}`);
})