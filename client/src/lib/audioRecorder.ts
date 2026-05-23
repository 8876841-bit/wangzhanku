/**
 * Cross-platform audio recording utility.
 * iOS Safari only supports audio/mp4 (AAC), while Android Chrome supports audio/webm.
 * This utility auto-detects the best supported format.
 */

export interface RecordingResult {
  base64: string;
  mimeType: string;
}

function getSupportedMimeType(): string {
  // Priority order: prefer webm (better quality), fallback to mp4 for iOS
  const types = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/mp4",
    "audio/ogg;codecs=opus",
    "audio/ogg",
  ];
  for (const type of types) {
    if (MediaRecorder.isTypeSupported(type)) {
      return type;
    }
  }
  // Fallback: let browser decide
  return "";
}

export function createAudioRecorder(
  onStop: (result: RecordingResult) => void,
  onError: (err: string) => void
) {
  let mediaRecorder: MediaRecorder | null = null;
  let stream: MediaStream | null = null;
  const chunks: Blob[] = [];

  const start = async () => {
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = getSupportedMimeType();
      
      const options: MediaRecorderOptions = {};
      if (mimeType) options.mimeType = mimeType;

      mediaRecorder = new MediaRecorder(stream, options);
      chunks.length = 0;

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };

      mediaRecorder.onstop = () => {
        stream?.getTracks().forEach((t) => t.stop());
        const actualMimeType = mediaRecorder?.mimeType || mimeType || "audio/mp4";
        const blob = new Blob(chunks, { type: actualMimeType });
        
        const reader = new FileReader();
        reader.onload = () => {
          const dataUrl = reader.result as string;
          const base64 = dataUrl.split(",")[1];
          onStop({ base64, mimeType: actualMimeType });
        };
        reader.onerror = () => onError("音频读取失败");
        reader.readAsDataURL(blob);
      };

      mediaRecorder.onerror = () => onError("录音过程出错");
      mediaRecorder.start(100); // collect data every 100ms
    } catch (err) {
      onError("无法访问麦克风，请检查权限设置");
    }
  };

  const stop = () => {
    if (mediaRecorder && mediaRecorder.state !== "inactive") {
      mediaRecorder.stop();
    }
  };

  return { start, stop };
}
