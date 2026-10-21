CREATE TABLE `oauth_flows` (
	`id` text PRIMARY KEY NOT NULL,
	`data` text NOT NULL,
	`expires` integer NOT NULL
);
