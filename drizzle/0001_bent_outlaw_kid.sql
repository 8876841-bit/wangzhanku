CREATE TABLE `github_configs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`githubToken` text,
	`repoOwner` varchar(128),
	`repoName` varchar(128),
	`branch` varchar(128) DEFAULT 'main',
	`lastSyncAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `github_configs_id` PRIMARY KEY(`id`),
	CONSTRAINT `github_configs_userId_unique` UNIQUE(`userId`)
);
--> statement-breakpoint
CREATE TABLE `note_relations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`sourceNoteId` int NOT NULL,
	`targetNoteId` int NOT NULL,
	`relationType` varchar(64) DEFAULT 'related',
	`description` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `note_relations_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `notes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`rawText` text,
	`imageUrl` text,
	`category` enum('idea','question','person','skill','todo','experience','quote','other') NOT NULL DEFAULT 'other',
	`title` varchar(255),
	`summary` text,
	`tags` json DEFAULT ('[]'),
	`aiAnswer` text,
	`researchSuggestions` json DEFAULT ('[]'),
	`status` enum('processing','done','error') NOT NULL DEFAULT 'processing',
	`githubSynced` int NOT NULL DEFAULT 0,
	`githubPath` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `notes_id` PRIMARY KEY(`id`)
);
