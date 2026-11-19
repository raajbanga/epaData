CREATE TABLE `result_cache` (
	`key` text PRIMARY KEY NOT NULL,
	`procedure` text NOT NULL,
	`input` text NOT NULL,
	`data_version` text NOT NULL,
	`value` text NOT NULL,
	`computed_at` integer NOT NULL
);
