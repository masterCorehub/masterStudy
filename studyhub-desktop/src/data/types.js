/**
 * @typedef {"video" | "audio" | "pdf"} LessonAssetKind
 */

/**
 * @typedef {{
 *   id: string,
 *   kind: LessonAssetKind,
 *   title: string,
 *   localPath: string,
 *   libraryPath: string,
 *   sizeBytes: number,
 *   durationSeconds?: number
 * }} LessonAsset
 */

/**
 * @typedef {{
 *   id: string,
 *   title: string,
 *   subtitle: string,
 *   assetIds: string[],
 *   durationLabel?: string,
 *   kindLabel?: string,
 *   status?: "completed" | "current" | "pending" | "locked"
 * }} Lesson
 */

/**
 * @typedef {{
 *   id: string,
 *   title: string,
 *   lessonCount: number,
 *   lessons: Lesson[]
 * }} Module
 */

/**
 * @typedef {{
 *   id: string,
 *   title: string,
 *   progress: number,
 *   modules: Module[]
 * }} Course
 */

export {};
