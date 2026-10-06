CREATE TABLE IF NOT EXISTS `feedback` (
	`id` text PRIMARY KEY NOT NULL,
	`rating` integer NOT NULL,
	`message` text NOT NULL,
	`created_at` text NOT NULL,
	`page` text NOT NULL,
	`ticket_id` text NOT NULL,
	`is_test` integer DEFAULT 0 NOT NULL,
	CONSTRAINT "rating_range" CHECK("feedback"."rating" between 1 and 5)
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `feedback_ticket_id_unique` ON `feedback` (`ticket_id`);
