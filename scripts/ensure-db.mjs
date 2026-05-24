import mysql from "mysql2/promise";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL is required");
}

const statements = [
  `CREATE TABLE IF NOT EXISTS entry_batches (
    id INT AUTO_INCREMENT PRIMARY KEY,
    userId INT NOT NULL,
    title VARCHAR(255),
    context TEXT,
    overallTheme TEXT,
    entryCount INT NOT NULL DEFAULT 0,
    createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS entries (
    id INT AUTO_INCREMENT PRIMARY KEY,
    userId INT NOT NULL,
    rawText TEXT,
    imageUrl TEXT,
    processingMode ENUM('recognize_only','organize','archive','deepdive') NOT NULL DEFAULT 'organize',
    sourceType ENUM('manual_note','screenshot','text','voice','douyin','xiaohongshu','bilibili','podcast','article','github','other') NOT NULL DEFAULT 'text',
    sourceName VARCHAR(255),
    sourceUrl TEXT,
    attentionPoint TEXT,
    batchId INT,
    category ENUM('Concept','Person','Case','Question','Insight','Idea','Skill','Action','Model','Trigger','Positioning') NOT NULL DEFAULT 'Idea',
    title VARCHAR(255),
    summary TEXT,
    tags JSON,
    aiAnswer TEXT,
    researchSuggestions JSON,
    noteItemsJson TEXT,
    coreTheme VARCHAR(500),
    connectionInsight TEXT,
    densityScore FLOAT,
    densityLevel ENUM('high','medium','low'),
    densityReason TEXT,
    status ENUM('processing','pending_review','confirmed','archived','needs_deepdive','duplicate','upgradeable','model','parked','discarded') NOT NULL DEFAULT 'processing',
    needsDeepDive TINYINT NOT NULL DEFAULT 0,
    isDuplicate TINYINT NOT NULL DEFAULT 0,
    duplicateOfId INT,
    similarityScore FLOAT,
    userCorrection TEXT,
    correctedCategory ENUM('Concept','Person','Case','Question','Insight','Idea','Skill','Action','Model','Trigger','Positioning'),
    correctedTitle VARCHAR(255),
    githubSynced TINYINT NOT NULL DEFAULT 0,
    githubPath TEXT,
    clusterId INT,
    nextActionType VARCHAR(64),
    nextAction TEXT,
    aiInterpretation TEXT,
    finalInterpretation TEXT,
    createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS entry_clusters (
    id INT AUTO_INCREMENT PRIMARY KEY,
    userId INT NOT NULL,
    name VARCHAR(255) NOT NULL,
    category ENUM('Concept','Person','Case','Question','Insight','Idea','Skill','Action','Model','Trigger','Positioning') NOT NULL DEFAULT 'Model',
    description TEXT,
    modelContent TEXT,
    entryCount INT NOT NULL DEFAULT 0,
    hasCaseEntry TINYINT NOT NULL DEFAULT 0,
    hasUserCorrection TINYINT NOT NULL DEFAULT 0,
    hasActionGuidance TINYINT NOT NULL DEFAULT 0,
    applicableScenario TEXT,
    status ENUM('accumulating','upgradeable','upgraded') NOT NULL DEFAULT 'accumulating',
    githubPath TEXT,
    createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS entry_relations (
    id INT AUTO_INCREMENT PRIMARY KEY,
    userId INT NOT NULL,
    sourceEntryId INT NOT NULL,
    targetEntryId INT NOT NULL,
    relationType ENUM('similar','supports','explains','example_of','contradicts','extends','triggers','can_merge','same_cluster','transferable') NOT NULL,
    confidence FLOAT,
    reason TEXT,
    createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS fusion_results (
    id INT AUTO_INCREMENT PRIMARY KEY,
    userId INT NOT NULL,
    entryAId INT NOT NULL,
    entryBId INT NOT NULL,
    fusionQuestion TEXT,
    fusionSummary TEXT,
    sharedPattern TEXT,
    conflictPoint TEXT,
    newPossibility TEXT,
    suggestedAction TEXT,
    modelCandidate TEXT,
    evidenceBasis TEXT,
    invalidConditions TEXT,
    nextVerification TEXT,
    confidence FLOAT,
    createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
];

async function columnExists(connection, tableName, columnName) {
  const [rows] = await connection.execute(
    `SELECT COUNT(*) AS count
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = ?
       AND COLUMN_NAME = ?`,
    [tableName, columnName],
  );

  return Number(rows[0]?.count ?? 0) > 0;
}

const connection = await mysql.createConnection(databaseUrl);

try {
  for (const statement of statements) {
    await connection.query(statement);
  }

  if (!(await columnExists(connection, "github_configs", "githubTokenEncrypted"))) {
    await connection.query("ALTER TABLE github_configs ADD COLUMN githubTokenEncrypted TEXT");
  }

  await connection.query("UPDATE users SET role = 'admin' WHERE openId = 'admin'");
  console.log("[ensure-db] database schema is ready");
} finally {
  await connection.end();
}
