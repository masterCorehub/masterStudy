export function calculateModuleDuration(lessons) {
  if (!lessons || !lessons.length) return "Auto";
  
  let totalMinutes = 0;
  
  lessons.forEach(lesson => {
    const dur = lesson.durationLabel || lesson.duration || "";
    if (!dur || dur === "Auto") return;
    
    // Match "1h 30m" or "2h" or "45m"
    const hmMatch = dur.match(/(?:(\d+)h)?\s*(?:(\d+)m)?/i);
    if (hmMatch && (hmMatch[1] || hmMatch[2]) && !dur.includes(':')) {
      const h = parseInt(hmMatch[1] || 0, 10);
      const m = parseInt(hmMatch[2] || 0, 10);
      totalMinutes += (h * 60) + m;
      return;
    }
    
    // Match "10:30" or "01:10:30"
    const timeParts = dur.split(':').map(p => parseInt(p, 10));
    if (timeParts.length === 3) {
      // HH:MM:SS
      totalMinutes += (timeParts[0] * 60) + timeParts[1] + (timeParts[2] / 60);
    } else if (timeParts.length === 2) {
      // MM:SS
      totalMinutes += timeParts[0] + (timeParts[1] / 60);
    }
  });
  
  const finalMinutes = Math.round(totalMinutes);
  if (finalMinutes === 0) return "Auto";
  
  const h = Math.floor(finalMinutes / 60);
  const m = finalMinutes % 60;
  
  if (h > 0 && m > 0) return `${h}h ${m}m`;
  if (h > 0) return `${h}h`;
  return `${m}m`;
}
