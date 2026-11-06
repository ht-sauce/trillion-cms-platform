ALTER TABLE `DemandSubmission` ADD COLUMN `client_ip` VARCHAR(64) NOT NULL DEFAULT '';
ALTER TABLE `DemandSubmission` ALTER COLUMN `client_ip` DROP DEFAULT;
