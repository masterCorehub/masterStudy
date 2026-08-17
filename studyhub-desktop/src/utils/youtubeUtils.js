export function parseYoutubeUrl(url) {
  if (!url) return null;
  
  // Check for playlist
  const listMatch = url.match(/[?&]list=([^&]+)/);
  if (listMatch) {
    return `https://www.youtube.com/embed/videoseries?list=${listMatch[1]}`;
  }
  
  // Check for standard watch?v=
  const vMatch = url.match(/[?&]v=([^&]+)/);
  if (vMatch) {
    return `https://www.youtube.com/embed/${vMatch[1]}`;
  }
  
  // Check for youtu.be
  const shortMatch = url.match(/youtu\.be\/([^?&]+)/);
  if (shortMatch) {
    return `https://www.youtube.com/embed/${shortMatch[1]}`;
  }
  
  // Check if it's already an embed URL
  if (url.includes('youtube.com/embed/')) {
    return url;
  }
  
  return url;
}
