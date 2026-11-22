ALTER TABLE `models` ADD `fit_years` text DEFAULT '' NOT NULL;--> statement-breakpoint
UPDATE `models` SET `fit_years` = substr(`train_years`, 1, 4) || '-' || substr(`validation_years`, -4);
