#!/usr/bin/env node// Author: Gross Corporation, https://github.com/grosscorporation/eb-options

const { SecretsManager } = require('@aws-sdk/client-secrets-manager');
const { ElasticBeanstalkClient, DescribeEnvironmentsCommand, UpdateEnvironmentCommand } = require('@aws-sdk/client-elastic-beanstalk');
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

console.log('###############################################################')
console.log('REGION ~ ', region)
console.log('###############################################################')

console.log('###############################################################')
console.log('SECRET NAME ~ ', secretName)
console.log('###############################################################')

const credentials = {
	region,
	accessKeyId: process.env.INPUT_AWS_ACCESS_KEY || process.env.AWS_ACCESS_KEY_ID,
	secretAccessKey: process.env.INPUT_AWS_SECRET_KEY || process.env.AWS_SECRET_ACCESS_KEY
}

const client = new SecretsManager(credentials)

async function updateEnvironmentVariables(variables) {
	try {
		const client = new ElasticBeanstalkClient(credentials)

		const describeParams = {
			ApplicationName: applicationName,
			EnvironmentNames: [environmentName]
		}

		const describeCommand = new DescribeEnvironmentsCommand(describeParams);
		const describeResponse = await client.send(describeCommand);

		if (describeResponse.Environments.length === 0) {
			throw new Error(`No environment found with name: ${environmentName}`);
		}

		const environmentId = describeResponse.Environments[0].EnvironmentId;


		const optionSettings = Object.entries(variables).map(([key, value]) => ({
			Namespace: 'aws:elasticbeanstalk:application:environment',
			OptionName: key,
			Value: value
		}))

		const updateParams = {
			EnvironmentId: environmentId,
			OptionSettings: optionSettings
		}

		const updateCommand = new UpdateEnvironmentCommand(updateParams);
		const updateResponse = await client.send(updateCommand)
		log('Environment variables updated:', updateResponse)
	} catch (error) {
		trace(error)
	}
}

client.getSecretValue({ SecretId: secretName }, (err, data) => {
	if (err) {
		throw err
	} else if ('SecretString' in data) {
		const secrets = JSON.parse(data.SecretString)
		if(IS_GITHUB_ACTION || process.env.NODE_ENV !== 'production'){
			updateEnvironmentVariables(secrets)
		}
	}
})

setTimeout(() => { }, 15000)

return 'done'
