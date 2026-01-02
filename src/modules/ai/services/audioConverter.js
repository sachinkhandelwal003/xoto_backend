import ffmpeg from "fluent-ffmpeg";
import ffmpegStatic from "ffmpeg-static";

ffmpeg.setFfmpegPath(ffmpegStatic);

export function convertWebmToWav(webmPath) {
  return new Promise((resolve, reject) => {
    const wavPath = webmPath.replace(/\.webm$/, ".wav");

    ffmpeg(webmPath)
      .audioCodec("pcm_s16le")
      .audioChannels(1)
      .audioFrequency(16000)
      .format("wav")
      .on("end", () => resolve(wavPath))
      .on("error", (err) => reject(err))
      .save(wavPath);
  });
}
