import type { ProjectTemplate } from 'librechat-data-provider';

export const templateLabels = {
  blank: 'com_project_template_blank',
  website: 'com_project_template_website',
  'data-admin': 'com_project_template_data_admin',
  'api-service': 'com_project_template_api',
  'knowledge-qa': 'com_project_template_knowledge',
  writing: 'com_project_template_writing',
  'task-assistant': 'com_project_template_task',
} as const satisfies Record<ProjectTemplate, string>;

export const templatePrompts = {
  website: 'com_project_start_website',
  'data-admin': 'com_project_start_data_admin',
  'api-service': 'com_project_start_api',
  'knowledge-qa': 'com_project_start_knowledge',
  writing: 'com_project_start_writing',
  'task-assistant': 'com_project_start_task',
} as const satisfies Record<Exclude<ProjectTemplate, 'blank'>, string>;
