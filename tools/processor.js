const ffmpeg = require('fluent-ffmpeg');
const config = require('../config');
const FileUtils = require('./file-utils');
const util = require('util');
const exec = util.promisify(require('child_process').exec);
const fs = require('fs');

/**
 * Main entry point for processor
 * @param {*} job 
 */
module.exports = async (job) => {
    ffmpeg.setFfmpegPath(config.ffmpegPath);
    console.log(`Processor called for job: ${job.id}`);

    return new Promise(async (resolve, reject) => {

        try {

            // Check if we already have processed file in folder
            const processedFiles = await FileUtils.checkForProcessedFile(job.data.id);
            if (processedFiles.length > 0) {
                job.progress(`${job.data.id}.mkv`);
                resolve(`${job.data.id}.mkv`);
                return;
            }

            // Let's start time measurement for conversion
            console.time("conversion");

            // Convert MJR files to .opus and .webm
            try {
                console.log(":: CONVERT MJR");
                job.progress(`${job.id}:${job.data.id}:convert-mjr`);
                await exec(`( cd /storage/recordings/ ; bash ./convert-mjr.sh ${job.data.id} )`);
            } catch (err) {
                console.error(err);
            };
            await sleep(1000);

            // Add sound to videos
            const sFiles = await FileUtils.getFilesForMixing(job.data.id);
            for (const file of sFiles) {
                await mixOpusWebm(job.data.id, file, job)
            }
            await sleep(1000);

            // Convert to MKV
            const mixedFiles = await FileUtils.getMixedFiles(job.data.id);
            for (const mixedFile of mixedFiles) {
                await convertToMKV(job.data.id, mixedFile, job);
            }
            await sleep(1000);

            // Add blank video in time gaps
            /*
            const userFileGroups = await FileUtils.getFilesForConcat(job.data.id);
            for (const userFileGroup of userFileGroups) {
                await alignUserFiles(userFileGroup);
            }
            */

            // Merge files (hstack)
            const convertedFiles = await FileUtils.getConvertedFiles(job.data.id);
            const finalFile = await mergeFiles(convertedFiles, job);

            // Cleanup
            try {
                await sleep(1000); // give it a second to unlock files
                const filesToDelete = await FileUtils.getFilesForDelete(job.data.id);
                await deleteTempFiles(filesToDelete);
            } catch (error) {
                console.log(error);
            }
            
            // End time measure and show up with results
            console.timeEnd("conversion");

            // Finalize job execution
            job.progress(finalFile);
            resolve(finalFile);

        } catch (error) {
            console.log(error);
            reject(error);
        }
    });
}


/**
 * Adds sound to video
 * @param {number} id - Room ID 
 * @param {*} file - Complex file object, that contains user ID and two files (audio & video) 
 * @param {*} job - Bull's job object
 */
function mixOpusWebm(id, file, job) {
    return new Promise(async (resolve, reject) => {

        const finalFileName = file.fileA.filename.endsWith('.webm') ? file.fileA.filename : file.fileB.filename;
        // mix .webm & .opus
        ffmpeg()
            .addInput(`${config.videosBaseDir}/${id}/${file.fileA.filename}`)
            .addInput(`${config.videosBaseDir}/${id}/${file.fileB.filename}`)
            .addOutputOption('-codec copy')
            .addOptions([`-threads ${config.ffmpegThreads}`])
            .on('start', function (commandLine) {
                console.log('FFMPEG | MIX_OPUS_WEBM | ' + commandLine);
            })
            .on('error', function (err) {
                console.log('An error occurred: ' + err.message);
                reject(err);
            })
            .on('progress', function (progress) {
                let progressText = `${job.id}:${job.data.id}:mixing:${file.user}:${progress.percent}`;
                console.log(progressText);
                job.progress(progressText);
            })
            .on('end', function () {
                console.log(`Mixing for ${file.user} finished!`);
                resolve('all ok');
            })
            .save(`${config.videosBaseDir}/${id}/mixed-${finalFileName}`)
            .run();
    });
}


/**
 * Convert mixed file to MKV and rescale if we have portrait video
 * @param {number} id - Room ID 
 * @param {*} file - mixed file object (*.webm)
 * @param {*} job - Bull's job object
 */
function convertToMKV(id, file, job) {
    return new Promise(async (resolve, reject) => {

        const initialFile = `${config.videosBaseDir}/${id}/${file.filename}`;
        const metadata = await getMetadata(initialFile);
        const duration = metadata.format.duration;
        const width = metadata.streams[0].width;
        const height = metadata.streams[0].height;

        console.log(initialFile);
        console.log(`DURATION: ${duration}`);
        console.log(`WIDTH: ${width}`);
        console.log(`HEIGHT: ${height}`);

        // mix .webm & .opus
        let command = ffmpeg();
        command
            .addInput(initialFile)
            //.size('?x240')
            //.videoBitrate('192k')
            .addOptions(['-filter:v scale=-1:240'])
            .addOptions([`-threads ${config.ffmpegThreads}`])
            .addOptions(['-vcodec libx264'])
            .addOptions(['-crf 21'])
            .addOptions(['-preset veryfast'])
            .on('start', function (commandLine) {
                console.log('FFMPEG | CONVERT_MKV | ' + commandLine);
            })
            .on('error', function (err) {
                console.log('An error occurred: ' + err.message);
                reject(err.message);
            })
            .on('progress', function (progress) {
                let progressText = `${job.id}:${job.data.id}:convert-mkv:${file.user}:${progress.percent}`;
                console.log(progressText);
                job.progress(progressText);
            })
            .on('end', function () {
                console.log(`Converting for ${file.user} finished!`);
                resolve('all ok');
            })
            .save(`${config.videosBaseDir}/${id}/converted-${file.filename}.mkv`)
            .run();
    });
}


/**
 * Align user files by own timing and concat
 * @param {*} userFileGroup 
 */
function alignUserFiles(userFileGroup) {
    return new Promise(async (resolve) => {
        const { files } = userFileGroup;

        if (files.length > 1) {
            files.sort((a, b) => {
                return a.time - b.time;
            });

            for (let i = 0; i < files.length; i++) {

                const metadata = await getMetadata(`${config.videosBaseDir}/${files[i].folder}/${files[i].filename}`);

                files[i].duration = metadata.format.duration;
                files[i].width = metadata.streams[0].width;
                files[i].height = metadata.streams[0].height;

                const endTime = files[i].time + files[i].duration * 1000;

                if (files[i + 1]) {
                    files[i].timeshift = Math.floor((files[i + 1].time - endTime) / 1000000);
                    files[i].colorFilterId = `[b${i}]`;
                    files[i].colorFilter = `color=black:s=${files[i].width}x${files[i].height}:d=${files[i].timeshift}${files[i].colorFilterId}`;
                    files[i].blackScreenFile = await generateBlackScreen(files[i]);
                } else {
                    files[i].timeshift = 0;
                }

                files[i].videoId = `[${i}:v]`;
            }

            console.log(files);
        }

        resolve();
    });
}

/**
 * Creates black screen file based on timeshift duration
 * @param {*} file 
 */
function generateBlackScreen(file) {
    const blackScreenFile = `${config.videosBaseDir}/${file.folder}/black-t${file.timeshift}-${file.filename}`;
    return new Promise((resolve, reject) => {
        ffmpeg()
            .input('color=black:s=320x240:r=24')
            .inputFormat('lavfi')
            .input('anullsrc')
            .inputFormat('lavfi')
            .outputOption('-ar 48000')
            .outputOption(`-t ${file.timeshift}`)
            .audioChannels('2')
            .addOptions([`-threads ${config.ffmpegThreads}`])
            .save(blackScreenFile)
            .on('start', function (commandLine) {
                console.log('FFMPEG | GEN_BLACK_SCREEN | ' + commandLine);
            })
            .on('error', function (err) {
                console.log('An error occurred: ' + err.message);
                reject(err.message);
            })
            .on('progress', function (progress) {
                console.log(progress);
            })
            .on('end', function () {
                console.log(`Processing for finished!`);
                resolve(blackScreenFile);
            })
            .run();
    });
}

/**
 * Merge videos horizontally using ffmpeg -hstack
 * @param {*} files 
 */
function mergeFiles(files, job) {
    return new Promise((resolve, reject) => {

        const finalFileName = `${config.videosBaseDir}/${files[0].folder}/${files[0].folder}.mkv`;
        const command = ffmpeg();

        for (const file of files) {
            command.addInput(`${config.videosBaseDir}/${file.folder}/${file.filename}`);
        }
        command
            .complexFilter(`hstack=inputs=${files.length};amerge=inputs=${files.length}`)
            .audioChannels(files.length)
            .addOptions(['-vcodec libx264'])
            .addOptions(['-crf 21'])
            .addOptions(['-preset veryfast'])
            .addOptions([`-threads ${config.ffmpegThreads}`])
            .save(finalFileName)
            .on('start', function (commandLine) {
                console.log('FFMPEG | MERGE_FILES | ' + commandLine);
            })
            .on('error', function (err) {
                console.log('An error occurred: ' + err.message);
                reject(err.message);
            })
            .on('progress', function (progress) {
                let progressText = `${job.id}:${job.data.id}:merge:${progress.percent}`;
                console.log(progressText);
                job.progress(progressText);
            })
            .on('end', function () {
                console.log(`Merge finished!`);
                resolve(finalFileName);
            })
            .run();
    });
}

/**
 * Delete temporary files created during conversion process
 * @param {*} files 
 */
function deleteTempFiles(files) {
    return new Promise((resolve, reject) => {
        for (const file of files) {
            fs.unlink(file.filepath, (err) => {
                if (err) {
                    console.error(err);
                    reject(err);
                    return;
                }
            });
        }
        resolve();
    });
}


/**
 * Retrieve metadata for media file (duration, width, height, etc)
 * @param {*} filePath 
 */
function getMetadata(filePath) {
    return new Promise((resolve) => {
        ffmpeg.ffprobe(filePath, (err, metadata) => {
            resolve(metadata);
        });
    });
}

/**
 * Waits for N ms
 * @param {*} ms 
 */
function sleep(ms) {
    return new Promise((resolve) => {
        setTimeout(resolve, ms);
    });
}