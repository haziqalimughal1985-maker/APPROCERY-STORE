CREATE TABLE `adminAuditLogs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`actorId` int NOT NULL,
	`action` varchar(100) NOT NULL,
	`targetType` varchar(60) NOT NULL,
	`targetId` int NOT NULL,
	`details` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `adminAuditLogs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `appScreenshots` (
	`id` int AUTO_INCREMENT NOT NULL,
	`appId` int NOT NULL,
	`storageKey` varchar(500) NOT NULL,
	`sortOrder` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `appScreenshots_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `appVersions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`appId` int NOT NULL,
	`uploadedBy` int NOT NULL,
	`versionName` varchar(80) NOT NULL,
	`versionCode` int NOT NULL,
	`storageKey` varchar(500),
	`fileSize` bigint,
	`sha256` varchar(64),
	`signingCertificateFingerprint` varchar(256),
	`manifestPackageName` varchar(255),
	`minSdk` int,
	`targetSdk` int,
	`changelog` text,
	`validationPassed` boolean NOT NULL DEFAULT false,
	`validationMessage` text,
	`status` enum('draft','uploading','validating','pending_review','published','rejected','unpublished','archived') NOT NULL DEFAULT 'draft',
	`publishedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `appVersions_id` PRIMARY KEY(`id`),
	CONSTRAINT `versions_app_code_unique` UNIQUE(`appId`,`versionCode`)
);
--> statement-breakpoint
CREATE TABLE `apps` (
	`id` int AUTO_INCREMENT NOT NULL,
	`ownerId` int NOT NULL,
	`name` varchar(160) NOT NULL,
	`slug` varchar(180) NOT NULL,
	`packageName` varchar(255) NOT NULL,
	`developerName` varchar(160) NOT NULL,
	`shortDescription` varchar(280) NOT NULL,
	`fullDescription` text NOT NULL,
	`categoryId` int,
	`iconStorageKey` varchar(500),
	`websiteUrl` varchar(500),
	`supportContact` varchar(320),
	`status` enum('draft','published','unpublished','archived') NOT NULL DEFAULT 'draft',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `apps_id` PRIMARY KEY(`id`),
	CONSTRAINT `apps_slug_unique` UNIQUE(`slug`),
	CONSTRAINT `apps_packageName_unique` UNIQUE(`packageName`)
);
--> statement-breakpoint
CREATE TABLE `categories` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(80) NOT NULL,
	`slug` varchar(100) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `categories_id` PRIMARY KEY(`id`),
	CONSTRAINT `categories_slug_unique` UNIQUE(`slug`)
);
--> statement-breakpoint
CREATE TABLE `downloadEvents` (
	`id` int AUTO_INCREMENT NOT NULL,
	`appId` int NOT NULL,
	`versionId` int NOT NULL,
	`status` varchar(40) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `downloadEvents_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `audit_actor_idx` ON `adminAuditLogs` (`actorId`);--> statement-breakpoint
CREATE INDEX `audit_target_idx` ON `adminAuditLogs` (`targetType`,`targetId`);--> statement-breakpoint
CREATE INDEX `screenshots_app_idx` ON `appScreenshots` (`appId`);--> statement-breakpoint
CREATE INDEX `versions_app_idx` ON `appVersions` (`appId`);--> statement-breakpoint
CREATE INDEX `versions_status_idx` ON `appVersions` (`status`);--> statement-breakpoint
CREATE INDEX `apps_owner_idx` ON `apps` (`ownerId`);--> statement-breakpoint
CREATE INDEX `apps_status_idx` ON `apps` (`status`);--> statement-breakpoint
CREATE INDEX `apps_category_idx` ON `apps` (`categoryId`);--> statement-breakpoint
CREATE INDEX `downloads_app_idx` ON `downloadEvents` (`appId`);--> statement-breakpoint
CREATE INDEX `downloads_version_idx` ON `downloadEvents` (`versionId`);