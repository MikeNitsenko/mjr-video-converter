// LOCAL
module.exports = {

    videosBaseDir: "C:/dev/HCSBK/videos/",
    ffmpegPath: "C:/dev/ffmpeg/ffmpeg-4.4-full_build/bin/ffmpeg.exe",
    ffmpegThreads: 4,
    //mjrConverterScript: "bash /storage/recordings/convert-mjr.sh"
    mjrConverterScript: "node -vfdfs"
};

// PRODUCTION
/*
module.exports = {

    videosBaseDir: "/storage/recordings/",
    ffmpegPath: "/usr/bin/ffmpeg",
    ffmpegThreads: 4,
    mjrConverterScript: "( cd /storage/recordings/ ; bash ./convert-mjr.sh)"
};
*/