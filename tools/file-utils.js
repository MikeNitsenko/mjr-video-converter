const fs = require('fs');
const config = require('../config');

// TODO: Refactor boilerplating for file search in dirs

/**
 * Get original files from folder with name {id}, sort them by time, and arrange in groups for mixing
 * @param {*} id 
 */
async function getFilesForMixing(id) {
    const path = config.videosBaseDir + id;
    const dir = await fs.promises.opendir(path);
    let files = [];
    for await (const dirent of dir) {
        if (dirent.name.startsWith('videoroom') && !dirent.name.endsWith('.mjr')) {
            const arr = dirent.name.split('-');
            files.push({ folder: id, user: Number(arr[3]), time: Number(arr[4]), filename: dirent.name, type: arr[5] });
        }
    }
    let sortedFiles = files.slice().sort((a, b) => {
        return a.time - b.time
    });

    let results = [];
    for (let i = 0; i < sortedFiles.length - 1; i++) {

        if ((sortedFiles[i + 1].user == sortedFiles[i].user) && (sortedFiles[i + 1].time == sortedFiles[i].time)) {
            results.push({
                user: sortedFiles[i].user,
                fileA: sortedFiles[i],
                fileB: sortedFiles[i + 1]
            });
        }
    }

    return new Promise((resolve) => {
        resolve(results);
    });
}

async function getMixedFiles(id) {

    console.log(':: GET MIXED FILES');
    const path = config.videosBaseDir + id;
    const dir = await fs.promises.opendir(path);
    let files = [];
    for await (const dirent of dir) {
        if (dirent.name.startsWith('mixed')) {
            const arr = dirent.name.split('-');
            files.push({ folder: id, user: Number(arr[4]), time: Number(arr[5]), filename: dirent.name, type: arr[6] });
        }
    }

    return new Promise((resolve) => {
        resolve(files);
    });
}

async function getConvertedFiles(id) {
    console.log(':: GET CONVERTED FILES');
    const path = config.videosBaseDir + id;
    const dir = await fs.promises.opendir(path);
    let files = [];
    for await (const dirent of dir) {
        if (dirent.name.startsWith('converted-mixed')) {
            const arr = dirent.name.split('-');
            files.push({ folder: id, user: Number(arr[5]), time: Number(arr[6]), filename: dirent.name, type: arr[7] });
        }
    }
    return new Promise((resolve) => {
        resolve(files);
    });
}

async function getFilesForConcat(id) {
    console.log(':: GET FILES FOR CONCAT');
    const path = config.videosBaseDir + id;
    const dir = await fs.promises.opendir(path);
    let files = [];
    for await (const dirent of dir) {
        if (dirent.name.startsWith('converted-mixed')) {
            const arr = dirent.name.split('-');
            files.push({ folder: id, user: Number(arr[5]), time: Number(arr[6]), filename: dirent.name, type: arr[7] });
        }
    }

    let results = {};
    for (const file of files) {
        if (!results.hasOwnProperty(file.user)) {
            results[file.user] = { user: file.user, files: [file] };
        } else {
            results[file.user].files.push(file)
        }
    }

    return new Promise((resolve) => {
        resolve(Object.values(results));
    });
}

async function getFilesForDelete(id) {
    console.log(':: GET FILES FOR DELETE');
    const path = config.videosBaseDir + id;
    const dir = await fs.promises.opendir(path);
    let files = [];
    for await (const dirent of dir) {
        if (dirent.name.startsWith('converted-mixed') 
                || dirent.name.startsWith('mixed') 
                || dirent.name.endsWith('.opus')
                || dirent.name.endsWith('.webm')) {
            console.log(dirent.name);
            files.push({ folder: id, filename: dirent.name, filepath: `${config.videosBaseDir}/${id}/${dirent.name}` });
        }
    }
    return new Promise((resolve) => {
        resolve(files);
    });
}

async function checkForProcessedFile(id) {
    console.log(':: CHECK IF ALREADY HAVE PROCESSED FILE');
    const path = config.videosBaseDir + id;
    const dir = await fs.promises.opendir(path);
    let files = [];
    for await (const dirent of dir) {
        if (dirent.name === `${id}.mkv`) {
            console.log(dirent.name);
            files.push({ folder: id, filename: dirent.name, filepath: `${config.videosBaseDir}/${id}/${dirent.name}` });
        }
    }
    return new Promise((resolve) => {
        resolve(files);
    });
}

module.exports = {
    getFilesForMixing: getFilesForMixing,
    getConvertedFiles: getConvertedFiles,
    getFilesForConcat: getFilesForConcat,
    getMixedFiles: getMixedFiles,
    getFilesForDelete: getFilesForDelete,
    checkForProcessedFile: checkForProcessedFile
};