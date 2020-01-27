import { SensorFields } from '@app/model';
import { SchemaDto } from './schema';
import { TestCase } from './test-case';

export interface EditorResult<T> {
    status_code: string;
    attributes: T;
}

export interface ExceptionInfo {
    exception?: string;
    message?: string;
}

export interface GitFiles<T> extends ExceptionInfo {
    files: T[];
}

export interface TestCaseEvaluation {
    files: Content<TestCase>[];
    test_result_raw_output: string;
}

export interface GeneralRule {
    file_name?: string;
}

export interface Content<T> extends GeneralRule {
    content: T;
}

export interface UserName extends ExceptionInfo {
    user_name: string;
}

export interface RepositoryLinksWrapper extends ExceptionInfo {
    rules_repositories: RepositoryLinks;
}

export interface RepositoryLinks {
    rule_store_url: string;
    rules_release_url: string;
    rulesetName: string;
}

export interface SchemaInfo extends ExceptionInfo {
    rules_schema: any;
}

export interface TestSchemaInfo extends ExceptionInfo {
    test_schema: any;
}

export interface PullRequestInfo extends ExceptionInfo {
    pull_request_pending: boolean;
    pull_request_url: string;
}

export interface ConfigWrapper<T> {
    versionFlag?: number;
    isDeployed?: boolean;
    isNew: boolean;
    configData: T;
    savedInBackend: boolean;
    name: string;
    author: string;
    version: number;
    description: string;
    tags?: string[];
    fileHistory?: FileHistory[];
}

export interface FileHistory {
    author: string;
    date: string;
    removed: number;
    added: number;
}

export interface ConfigTestDto {
    files: Content<ConfigData>[],
    event: string,
}

export interface EvaluateTestCaseDto {
    files: Content<TestCase>[],
    event: string,
}

export type ConfigData = any;

export interface Deployment<T> {
    configs: T[];
    deploymentVersion: number;
}

export interface BootstrapData {
    configs: ConfigWrapper<ConfigData>[],
    configSchema: SchemaDto,
    currentUser: string,
    pullRequestPending: PullRequestInfo,
    storedDeployment:  Deployment<ConfigWrapper<ConfigData>>,
    sensorFields: SensorFields[],
    deploymentHistory?: FileHistory[],
    testCaseSchema: any,
    testSpecificationSchema: any,
};

export interface ConfigTestResult {
    exception?: string;
    message?: string;
    test_result_output?: string;
    test_result_complete?: boolean;
    test_result_raw_output?: object;
}

export interface DeploymentWrapper {
    storedDeployment: Deployment<ConfigWrapper<ConfigData>>;
    deploymentHistory: FileHistory[];
}