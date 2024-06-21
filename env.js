#!/usr/bin/env node
// Author: Gross Corporation, https://github.com/grosscorporation/eb-options

const { SecretsManager } = require('@aws-sdk/client-secrets-manager');
const { ElasticBeanstalkClient, DescribeApplicationsCommand, DescribeEnvironmentsCommand, UpdateEnvironmentCommand } = require('@aws-sdk/client-elastic-beanstalk');
const { STSClient, AssumeRoleCommand } = require('@aws-sdk/client-sts');
const { log, trace } = require('console');

try {
	require('dotenv').config({ path: process.cwd() + '/.env' })
} catch (e) { }

const IS_GITHUB_ACTION = !!process.env.GITHUB_ACTIONS

const region = process.env.INPUT_REGION || process.env.AWS_REGION || 'eu-west-1'
const secretName = process.env.INPUT_AWS_SECRET || process.env.AWS_SECRET
const environmentName = process.env.INPUT_ENVIRONMENT_NAME || process.env.ENVIRONMENT_NAME
const applicationName = process.env.INPUT_APPLICATION_NAME || process.env.APPLICATION_NAME
const roleToAssume = process.env.INPUT_ROLE_TO_ASSUME || process.env.ROLE_TO_ASSUME
const awsAccountId = process.env.INPUT_AWS_ACCOUNT_ID || process.env.AWS_ACCOUNT_ID

console.log('###############################################################')
console.log('REGION ~ ', region)
console.log('###############################################################')

console.log('###############################################################')
console.log('SECRET NAME ~ ', secretName)
console.log('###############################################################')

console.log('###############################################################')
console.log('AWS ACCOUNT ID ~ ', awsAccountId)
console.log('###############################################################')

async function getCredentials() {
	const baseCredentials = {
		region,
		accessKeyId: process.env.INPUT_AWS_ACCESS_KEY || process.env.AWS_ACCESS_KEY_ID,
		secretAccessKey: process.env.INPUT_AWS_SECRET_KEY || process.env.AWS_SECRET_ACCESS_KEY
	};

	if (roleToAssume && awsAccountId) {
		const roleArn = `arn:aws:iam::${awsAccountId}:role/${roleToAssume}`;
		const stsClient = new STSClient({ region, credentials: baseCredentials });
		const assumeRoleCommand = new AssumeRoleCommand({
			RoleArn: roleArn,
			RoleSessionName: 'AssumeRoleSession'
		});

		try {
			const assumedRole = await stsClient.send(assumeRoleCommand);
			return {
				region,
				accessKeyId: assumedRole.Credentials.AccessKeyId,
				secretAccessKey: assumedRole.Credentials.SecretAccessKey,
				sessionToken: assumedRole.Credentials.SessionToken
			};
		} catch (error) {
			console.error('Failed to assume role:', error);
			throw error;
		}
	} else if (roleToAssume) {
		console.warn('AWS Account ID must be provided with the Role to Assume.');
	}

	return baseCredentials;
}

async function updateEnvironmentVariables(variables, credentials) {
	try {
		const client = new ElasticBeanstalkClient(credentials);

		const describeApplicationsParams = {
			ApplicationNames: [applicationName]
		}

		const describeApplicationsCommand = new DescribeApplicationsCommand(describeApplicationsParams);
		const describeApplicationsResponse = await client.send(describeApplicationsCommand);

		if (describeApplicationsResponse.Applications.length === 0) {
			throw new Error(`No application found with name: ${applicationName}`);
		}

		const describeEnvironmentsParams = {
			ApplicationName: applicationName,
			EnvironmentNames: [environmentName]
		}

		const describeEnvironmentsCommand = new DescribeEnvironmentsCommand(describeEnvironmentsParams);
		const describeEnvironmentsResponse = await client.send(describeEnvironmentsCommand);

		if (describeEnvironmentsResponse.Environments.length === 0) {
			throw new Error(`No environment found with name: ${environmentName}`);
		}

		const environmentId = describeEnvironmentsResponse.Environments[0].EnvironmentId;

		const optionSettings = Object.entries(variables).map(([key, value]) => ({
			Namespace: 'aws:elasticbeanstalk:application:environment',
			OptionName: key,
			Value: value
		}));

		const updateParams = {
			EnvironmentId: environmentId,
			OptionSettings: optionSettings
		};

		const updateCommand = new UpdateEnvironmentCommand(updateParams);
		const updateResponse = await client.send(updateCommand);
		log('Environment variables updated:', updateResponse);
	} catch (error) {
		trace(error);
	}
}

(async () => {
	const credentials = await getCredentials();
	const secretsClient = new SecretsManager(credentials);

	secretsClient.getSecretValue({ SecretId: secretName }, (err, data) => {
		if (err) {
			throw err;
		} else if ('SecretString' in data) {
			const secrets = JSON.parse(data.SecretString);
			if (IS_GITHUB_ACTION || process.env.NODE_ENV !== 'production') {
				updateEnvironmentVariables(secrets, credentials);
			}
		}
	});

	setTimeout(() => { }, 15000);
})()

return 'done'
