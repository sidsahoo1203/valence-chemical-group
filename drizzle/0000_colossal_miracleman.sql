CREATE TABLE `atomic_guard` (
	`ok` integer NOT NULL,
	CONSTRAINT "must_change_one_row" CHECK("atomic_guard"."ok" = 1)
);
--> statement-breakpoint
CREATE TABLE `rate_limits` (
	`key` text PRIMARY KEY NOT NULL,
	`count` integer NOT NULL,
	`expires` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `records` (
	`scope` text NOT NULL,
	`kind` text NOT NULL,
	`id` text NOT NULL,
	`owner` text DEFAULT '' NOT NULL,
	`data` text NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	PRIMARY KEY(`scope`, `kind`, `id`)
);
--> statement-breakpoint
CREATE INDEX `records_owner` ON `records` (`scope`,`kind`,`owner`);