import type { PresetKey } from '../preset-contract.ts'
import type { Language } from '../preset-contract.ts'

export type { Language }
export const LANGUAGES: readonly Language[] = ['zh', 'en', 'ru']

export type FieldKey = PresetKey | 'body' | 'source'

/**
 * Per-language UI strings for the presets page. Pure literals are string
 * properties; strings that interpolate runtime values (entry ids, model names,
 * counts) are functions taking those values.
 */
export interface Strings {
  titles: Record<'create' | 'copy' | 'edit' | 'repair', string>
  labels: Record<FieldKey, string>
  backToList: string
  agentsTitle: string
  copiedFrom: (id: string) => string
  refreshing: string
  refresh: string
  createAgent: string
  directory: (path: string) => string
  directoryHint: string
  errorActionIncomplete: string
  errorReadFailed: string
  checkField: (label: string) => string
  goToRepair: string
  loadingPresets: string
  refreshFailed: (hasList: boolean) => string
  emptyTitle: string
  emptyHint: string
  inheritDefault: string
  inheritDefaultRoute: (route: string) => string
  inheritDefaultWithNote: (note: string) => string
  thinkingHint: string
  thinkingHintEfforts: (efforts: string) => string
  thinkingInheritDeployment: string
  thinkingUnlisted: (id: string) => string
  thinkingUnsupportedOption: string
  thinkingUnsupportedValue: (id: string) => string
  thinkingUnsupportedHint: (model: string) => string
  thinkingLoading: string
  thinkingFallbackHint: string
  statusBadgeError: string
  statusBadgeReady: string
  statusBadgeRaw: string
  editAria: (id: string, isError: boolean) => string
  copyAria: (id: string) => string
  deleteAria: (id: string) => string
  copyAction: string
  editAction: string
  deleteAction: string
  parseError: string
  descriptionEmpty: string
  unstructuredNotice: string
  modelRouteTitle: (value: string) => string
  modelChipLabel: string
  thinkingChipTitle: (value: string) => string
  thinkingChipLabel: string
  backgroundContinuousTitle: string
  backgroundOnceTitle: string
  backgroundContinuous: string
  backgroundForeground: string
  deepLeafTitle: string
  deepDispatchTitle: (depth: string) => string
  deepLeaf: string
  deepValue: (depth: string) => string
  roundsTitle: (rounds: string) => string
  roundsValue: (rounds: string) => string
  nameHintEditable: string
  nameHintFixed: string
  diagnosticTitle: string
  sourceHint: (id: string) => string
  displayNameHint: string
  descriptionHint: string
  customModelHint: string
  customModelPlaceholder: string
  selectFromList: string
  catalogModelHint: string
  notInCatalogGroup: string
  customInputOption: string
  customInputButton: string
  loadingCatalog: string
  catalogError: (error: string) => string
  catalogErrorHint: string
  retryCatalog: string
  catalogFailure: (name: string, message: string) => string
  bodyHint: string
  advancedTitle: string
  deepHint: string
  deepPlaceholder: string
  backgroundHint: string
  backgroundInheritOption: string
  backgroundFalseOption: string
  backgroundTrueOption: string
  maxRoundsHint: string
  maxRoundsPlaceholder: string
  saving: string
  unsavedChanges: string
  noChanges: string
  cancel: string
  savePreset: string
  deleteConfirmTitle: (id: string) => string
  displayNameConfirmTitle: string
  discardConfirmTitle: string
  closeLabel: string
  confirmDelete: string
  confirmSave: string
  discardChanges: string
  deleteConfirmText: (id: string) => string
  displayNameConfirmText: string
  discardRefreshText: string
  discardRepairText: string
  discardListText: string
  confirmTarget: (id: string) => string
  deletedNotice: (id: string) => string
  savedNotice: (id: string) => string
}

const zh: Strings = {
  titles: { create: '新建子智能体', copy: '复制子智能体', edit: '编辑子智能体', repair: '原文修复' },
  labels: { name: '内部名称', display_name: '显示名', description: '职责描述', model: '模型', thinking: '思考强度', deep: '深度', background: '后台运行', maxRounds: '轮数上限', body: '系统提示词', source: '完整 Markdown 原文' },
  backToList: '返回列表',
  agentsTitle: '子智能体',
  copiedFrom: id => `复制自 ${id}.md，保存为新文件。`,
  refreshing: '正在刷新…',
  refresh: '刷新',
  createAgent: '新建子智能体',
  directory: path => `目录：${path}`,
  directoryHint: '指向此目录的 profile 共享预设。修改将用于后续调用，已运行的任务保持原提示词。',
  errorActionIncomplete: '操作未完成',
  errorReadFailed: '读取失败',
  checkField: label => `检查${label}`,
  goToRepair: '转到原文修复',
  loadingPresets: '正在读取预设目录…',
  refreshFailed: hasList => `未能读取最新目录。请检查上方错误后刷新${hasList ? '；下方保留上次读取的列表。' : '。'}`,
  emptyTitle: '此目录暂无子智能体',
  emptyHint: '创建一个子智能体，填写它的职责和系统提示词。',
  inheritDefault: '继承默认',
  inheritDefaultRoute: route => `继承默认 (${route})`,
  inheritDefaultWithNote: note => `继承默认${note}`,
  thinkingHint: '留空继承当前部署的思考设置。',
  thinkingHintEfforts: efforts => `留空继承当前部署的思考设置。当前模型可用：${efforts}。`,
  thinkingInheritDeployment: '继承当前部署的思考设置',
  thinkingUnlisted: id => `${id} (未在列表中)`,
  thinkingUnsupportedOption: '不支持思考强度（继承/关闭）',
  thinkingUnsupportedValue: id => `${id} (该模型不支持)`,
  thinkingUnsupportedHint: model => `当前模型（${model}）不支持思考强度设置。`,
  thinkingLoading: '正在加载可用思考强度…',
  thinkingFallbackHint: '未在模型目录中找到该模型，提供标准思考强度选项。',
  statusBadgeError: '文件错误',
  statusBadgeReady: '可用',
  statusBadgeRaw: '原文编辑',
  editAria: (id, isError) => `${isError ? '修复' : '编辑'} ${id}`,
  copyAria: id => `复制 ${id}`,
  deleteAria: id => `删除 ${id}.md`,
  copyAction: '复制',
  editAction: '编辑',
  deleteAction: '删除',
  parseError: '配置解析异常',
  descriptionEmpty: '未填写职责描述',
  unstructuredNotice: '此文件需要通过原文编辑保留结构。',
  modelRouteTitle: value => `模型路由：${value}`,
  modelChipLabel: '模型：',
  thinkingChipTitle: value => `思考强度：${value}`,
  thinkingChipLabel: '思考强度：',
  backgroundContinuousTitle: '后台可持续会话',
  backgroundOnceTitle: '前台一次性运行',
  backgroundContinuous: '后台可持续',
  backgroundForeground: '前台运行',
  deepLeafTitle: '叶子节点：禁止派发子代理',
  deepDispatchTitle: depth => `派发深度：${depth}`,
  deepLeaf: '叶子(禁派发)',
  deepValue: depth => `深度：${depth}`,
  roundsTitle: rounds => `单次会话轮数上限：${rounds} 轮`,
  roundsValue: rounds => `上限 ${rounds} 轮`,
  nameHintEditable: '新文件名等于内部名称；使用安全且唯一的名称。',
  nameHintFixed: '内部名称固定为当前文件标识，不能通过编辑或修复改名。',
  diagnosticTitle: '原文件诊断',
  sourceHint: id => `包含 frontmatter 和系统提示词。将 name 纠正为 ${id}；保存时按同一规则校验。`,
  displayNameHint: '可留空，使用内部名称作为显示标签。变更已有显示名时会提示历史任务影响。',
  descriptionHint: '一行职责描述，用于帮助选择合适的子智能体。',
  customModelHint: '填写自定义 provider/model 路由（例如 openai/gpt-6.1-sol）或留空继承默认。',
  customModelPlaceholder: '例如：openai/gpt-6.1-sol',
  selectFromList: '从列表选择',
  catalogModelHint: '从当前部署已启用的模型中选择；留空继承默认设置。',
  notInCatalogGroup: '当前设置 / 未在目录中',
  customInputOption: '自定义输入…',
  customInputButton: '自定义输入',
  loadingCatalog: '正在加载模型目录…',
  catalogError: error => `模型目录加载失败：${error}`,
  catalogErrorHint: '当前模型值仍保留，可继续使用自定义路由。',
  retryCatalog: '重试模型目录',
  catalogFailure: (name, message) => `模型目录 ${name}：${message}`,
  bodyHint: '作为系统提示词原样使用，支持 Markdown。',
  advancedTitle: '高级设置',
  deepHint: '留空沿用缺省深度 1；0 禁止此角色继续派发子代理。',
  deepPlaceholder: '继承（1）',
  backgroundHint: '留空沿用缺省前台；true 为后台可持续会话。',
  backgroundInheritOption: '继承（前台）',
  backgroundFalseOption: 'false（前台）',
  backgroundTrueOption: 'true（后台）',
  maxRoundsHint: '留空继承全局轮数上限；填写正整数。',
  maxRoundsPlaceholder: '继承全局',
  saving: '正在保存…',
  unsavedChanges: '有未保存的修改',
  noChanges: '尚未修改',
  cancel: '取消',
  savePreset: '保存预设',
  deleteConfirmTitle: id => `删除 ${id}.md？`,
  displayNameConfirmTitle: '确认显示名变更',
  discardConfirmTitle: '放弃未保存的修改？',
  closeLabel: '取消确认',
  confirmDelete: '确认删除',
  confirmSave: '确认并保存',
  discardChanges: '放弃修改',
  deleteConfirmText: id => `将删除 ${id}.md。所有指向此目录的 profile 都将失去此预设；删除后无法从本页恢复。`,
  displayNameConfirmText: '显示名新增、清除或变更会改变查找历史任务时使用的显示标签。旧任务可能无法再按 name 续跑或追问，历史记录不会迁移。',
  discardRefreshText: '刷新将丢弃当前输入并重新读取目录。',
  discardRepairText: '将丢弃当前表单输入，并打开读取时的完整原文。',
  discardListText: '返回列表将丢弃当前输入。',
  confirmTarget: id => `目标：${id}.md`,
  deletedNotice: id => `已删除 ${id}.md`,
  savedNotice: id => `已保存 ${id}.md`,
}

// Russian wording reused verbatim from the approved i18n/ru branch.
const ru: Strings = {
  titles: { create: 'Новый суб-агент', copy: 'Копировать суб-агента', edit: 'Редактировать суб-агента', repair: 'Ремонт исходника' },
  labels: { name: 'Внутреннее имя', display_name: 'Отображаемое имя', description: 'Описание обязанностей', model: 'Модель', thinking: 'Уровень thinking', deep: 'Глубина', background: 'Фоновый запуск', maxRounds: 'Лимит раундов', body: 'Системная подсказка', source: 'Полный исходный Markdown' },
  backToList: 'К списку',
  agentsTitle: 'Суб-агенты',
  copiedFrom: id => `Скопировано из ${id}.md — сохраняется как новый файл.`,
  refreshing: 'Обновление…',
  refresh: 'Обновить',
  createAgent: 'Новый суб-агент',
  directory: path => `Каталог: ${path}`,
  directoryHint: 'Профили, указывающие на этот каталог, разделяют пресеты. Изменения будут применяться к последующим вызовам; уже запущенные задачи сохраняют исходную подсказку.',
  errorActionIncomplete: 'Операция не завершена',
  errorReadFailed: 'Ошибка чтения',
  checkField: label => `Проверить ${label}`,
  goToRepair: 'Перейти к ремонту исходника',
  loadingPresets: 'Чтение каталога пресетов…',
  refreshFailed: hasList => `Не удалось прочитать актуальный каталог; проверьте ошибку выше и обновите${hasList ? '; ниже сохранён список прошлого чтения.' : '.'}`,
  emptyTitle: 'В этом каталоге пока нет суб-агентов',
  emptyHint: 'Создайте суб-агента и укажите его обязанности и системную подсказку.',
  inheritDefault: 'Наследовать по умолчанию',
  inheritDefaultRoute: route => `Наследовать (${route})`,
  inheritDefaultWithNote: note => `Наследовать по умолчанию${note}`,
  thinkingHint: 'Оставьте пустым, чтобы унаследовать настройки thinking текущего развёртывания.',
  thinkingHintEfforts: efforts => `Оставьте пустым, чтобы унаследовать настройки thinking текущего развёртывания. Доступно для текущей модели: ${efforts}.`,
  thinkingInheritDeployment: 'Наследовать настройки thinking текущего развёртывания',
  thinkingUnlisted: id => `${id} (нет в списке)`,
  thinkingUnsupportedOption: 'Не поддерживает уровни thinking (наследование/выкл.)',
  thinkingUnsupportedValue: id => `${id} (модель не поддерживает)`,
  thinkingUnsupportedHint: model => `Модель (${model}) не поддерживает настройку уровней thinking.`,
  thinkingLoading: 'Загрузка доступных уровней thinking…',
  thinkingFallbackHint: 'Модель не найдена в каталоге моделей; предлагаются стандартные уровни thinking.',
  statusBadgeError: 'Ошибка файла',
  statusBadgeReady: 'Готов',
  statusBadgeRaw: 'Редактирование исходника',
  editAria: (id, isError) => `${isError ? 'Ремонт' : 'Редактировать'} ${id}`,
  copyAria: id => `Копировать ${id}`,
  deleteAria: id => `Удалить ${id}.md`,
  copyAction: 'Копировать',
  editAction: 'Редактировать',
  deleteAction: 'Удалить',
  parseError: 'Ошибка разбора конфигурации',
  descriptionEmpty: 'Описание не указано',
  unstructuredNotice: 'Чтобы сохранить структуру, этот файл нужно редактировать как исходник.',
  modelRouteTitle: value => `Маршрут модели: ${value}`,
  modelChipLabel: 'Модель: ',
  thinkingChipTitle: value => `Уровень thinking: ${value}`,
  thinkingChipLabel: 'Thinking: ',
  backgroundContinuousTitle: 'Непрерывная фоновая сессия',
  backgroundOnceTitle: 'Разовый запуск на переднем плане',
  backgroundContinuous: 'Фон, непрерывный',
  backgroundForeground: 'Передний план',
  deepLeafTitle: 'Листовой узел: запуск суб-агентов запрещён',
  deepDispatchTitle: depth => `Глубина запуска: ${depth}`,
  deepLeaf: 'Лист (без запуска)',
  deepValue: depth => `Глубина: ${depth}`,
  roundsTitle: rounds => `Лимит раундов одной сессии: ${rounds}`,
  roundsValue: rounds => `Лимит: ${rounds}`,
  nameHintEditable: 'Новое имя файла равно внутреннему имени; используйте безопасное уникальное имя.',
  nameHintFixed: 'Внутреннее имя закреплено за идентификатором текущего файла; переименовать его редактированием или ремонтом нельзя.',
  diagnosticTitle: 'Диагностика исходного файла',
  sourceHint: id => `Содержит frontmatter и системную подсказку. name исправляется на ${id}; при сохранении проверка по тем же правилам.`,
  displayNameHint: 'Можно оставить пустым — в качестве метки используется внутреннее имя. При изменении существующего отображаемого имени появится предупреждение о влиянии на исторические задачи.',
  descriptionHint: 'Однострочное описание обязанностей, помогающее выбрать подходящего суб-агента.',
  customModelHint: 'Укажите собственный маршрут provider/model (например, openai/gpt-6.1-sol) или оставьте пустым, чтобы наследовать по умолчанию.',
  customModelPlaceholder: 'Например: openai/gpt-6.1-sol',
  selectFromList: 'Выбрать из списка',
  catalogModelHint: 'Выберите модель, включённую в текущем развёртывании; оставьте пустым, чтобы унаследовать значение по умолчанию.',
  notInCatalogGroup: 'Текущая настройка / нет в каталоге',
  customInputOption: 'Свой вариант…',
  customInputButton: 'Свой вариант',
  loadingCatalog: 'Загрузка каталога моделей…',
  catalogError: error => `Не удалось загрузить каталог моделей: ${error}`,
  catalogErrorHint: 'Текущее значение модели сохранено; можно продолжать использовать собственный маршрут.',
  retryCatalog: 'Повторить загрузку каталога',
  catalogFailure: (name, message) => `Каталог моделей ${name}: ${message}`,
  bodyHint: 'Используется дословно как системная подсказка; поддерживается Markdown.',
  advancedTitle: 'Дополнительные настройки',
  deepHint: 'Оставьте пустым, чтобы применить глубину по умолчанию 1; 0 запрещает этому агенту запускать суб-агентов.',
  deepPlaceholder: 'Наследовать (1)',
  backgroundHint: 'Оставьте пустым, чтобы применить передний план по умолчанию; true = непрерывная фоновая сессия.',
  backgroundInheritOption: 'Наследовать (передний план)',
  backgroundFalseOption: 'false (передний план)',
  backgroundTrueOption: 'true (фон)',
  maxRoundsHint: 'Оставьте пустым, чтобы унаследовать глобальный лимит раундов; укажите положительное целое.',
  maxRoundsPlaceholder: 'Унаследовать глобальный',
  saving: 'Сохранение…',
  unsavedChanges: 'Есть несохранённые изменения',
  noChanges: 'Изменений нет',
  cancel: 'Отмена',
  savePreset: 'Сохранить пресет',
  deleteConfirmTitle: id => `Удалить ${id}.md?`,
  displayNameConfirmTitle: 'Подтвердить изменение отображаемого имени',
  discardConfirmTitle: 'Отменить несохранённые изменения?',
  closeLabel: 'Отменить подтверждение',
  confirmDelete: 'Подтвердить удаление',
  confirmSave: 'Подтвердить и сохранить',
  discardChanges: 'Отменить изменения',
  deleteConfirmText: id => `Будет удалён ${id}.md. Все профили, указывающие на этот каталог, потеряют этот пресет; после удаления восстановить со страницы нельзя.`,
  displayNameConfirmText: 'Добавление, очистка или изменение отображаемого имени влияет на метку, по которой находятся исторические задачи. Старые задачи могут перестать продолжаться или уточняться по name; история не мигрирует.',
  discardRefreshText: 'Обновление отбросит текущий ввод и перечитает каталог.',
  discardRepairText: 'Текущий ввод формы будет отброшен, откроется полный исходник, считанный при чтении.',
  discardListText: 'Возврат к списку отбросит текущий ввод.',
  confirmTarget: id => `Цель: ${id}.md`,
  deletedNotice: id => `Удалён ${id}.md`,
  savedNotice: id => `Сохранён ${id}.md`,
}

const en: Strings = {
  titles: { create: 'New Sub-agent', copy: 'Copy Sub-agent', edit: 'Edit Sub-agent', repair: 'Repair Source' },
  labels: { name: 'Internal Name', display_name: 'Display Name', description: 'Responsibilities', model: 'Model', thinking: 'Thinking', deep: 'Depth', background: 'Background', maxRounds: 'Max Rounds', body: 'System Prompt', source: 'Full Source Markdown' },
  backToList: 'Back to list',
  agentsTitle: 'Sub-agents',
  copiedFrom: id => `Copied from ${id}.md; saved as a new file.`,
  refreshing: 'Refreshing…',
  refresh: 'Refresh',
  createAgent: 'New Sub-agent',
  directory: path => `Directory: ${path}`,
  directoryHint: 'Profiles pointing at this directory share presets. Changes apply to future calls; already-running tasks keep their original prompt.',
  errorActionIncomplete: 'Operation not completed',
  errorReadFailed: 'Read failed',
  checkField: label => `Check ${label}`,
  goToRepair: 'Go to source repair',
  loadingPresets: 'Reading preset directory…',
  refreshFailed: hasList => `Failed to read the latest catalog. Check the error above and refresh${hasList ? '; the previous list is kept below.' : '.'}`,
  emptyTitle: 'No sub-agents in this directory yet',
  emptyHint: 'Create a sub-agent and fill in its responsibilities and system prompt.',
  inheritDefault: 'Inherit default',
  inheritDefaultRoute: route => `Inherit default (${route})`,
  inheritDefaultWithNote: note => `Inherit default${note}`,
  thinkingHint: "Leave empty to inherit the deployment's thinking settings.",
  thinkingHintEfforts: efforts => `Leave empty to inherit the deployment's thinking settings. Available for the current model: ${efforts}.`,
  thinkingInheritDeployment: "Inherit the deployment's thinking settings",
  thinkingUnlisted: id => `${id} (not listed)`,
  thinkingUnsupportedOption: 'No thinking levels supported (inherit/off)',
  thinkingUnsupportedValue: id => `${id} (unsupported by this model)`,
  thinkingUnsupportedHint: model => `The current model (${model}) does not support thinking settings.`,
  thinkingLoading: 'Loading available thinking levels…',
  thinkingFallbackHint: 'Model not found in the catalog; standard thinking levels are offered.',
  statusBadgeError: 'File error',
  statusBadgeReady: 'Ready',
  statusBadgeRaw: 'Raw source edit',
  editAria: (id, isError) => `${isError ? 'Repair' : 'Edit'} ${id}`,
  copyAria: id => `Copy ${id}`,
  deleteAria: id => `Delete ${id}.md`,
  copyAction: 'Copy',
  editAction: 'Edit',
  deleteAction: 'Delete',
  parseError: 'Configuration parse error',
  descriptionEmpty: 'No responsibilities provided',
  unstructuredNotice: 'This file must be edited as raw source to preserve its structure.',
  modelRouteTitle: value => `Model route: ${value}`,
  modelChipLabel: 'Model: ',
  thinkingChipTitle: value => `Thinking: ${value}`,
  thinkingChipLabel: 'Thinking: ',
  backgroundContinuousTitle: 'Continuous background session',
  backgroundOnceTitle: 'One-shot foreground run',
  backgroundContinuous: 'Background, continuous',
  backgroundForeground: 'Foreground',
  deepLeafTitle: 'Leaf node: dispatching sub-agents is forbidden',
  deepDispatchTitle: depth => `Dispatch depth: ${depth}`,
  deepLeaf: 'Leaf (no dispatch)',
  deepValue: depth => `Depth: ${depth}`,
  roundsTitle: rounds => `Max rounds per session: ${rounds}`,
  roundsValue: rounds => `Limit: ${rounds}`,
  nameHintEditable: 'The new file name equals the internal name; use a safe, unique name.',
  nameHintFixed: 'The internal name is fixed to the current file identifier and cannot be renamed by editing or repair.',
  diagnosticTitle: 'Original file diagnostics',
  sourceHint: id => `Contains frontmatter and the system prompt. name is corrected to ${id}; saving validates by the same rule.`,
  displayNameHint: 'Can be left empty to use the internal name as the display label. Changing an existing display name warns about the impact on historical tasks.',
  descriptionHint: 'A one-line description of responsibilities used to help pick a suitable sub-agent.',
  customModelHint: 'Enter a custom provider/model route (for example openai/gpt-6.1-sol) or leave empty to inherit the default.',
  customModelPlaceholder: 'For example: openai/gpt-6.1-sol',
  selectFromList: 'Select from list',
  catalogModelHint: 'Choose from models enabled in the current deployment; leave empty to inherit the default.',
  notInCatalogGroup: 'Current setting / not in catalog',
  customInputOption: 'Custom input…',
  customInputButton: 'Custom input',
  loadingCatalog: 'Loading model catalog…',
  catalogError: error => `Failed to load the model catalog: ${error}`,
  catalogErrorHint: 'The current model value is kept; a custom route can still be used.',
  retryCatalog: 'Retry catalog load',
  catalogFailure: (name, message) => `Model catalog ${name}: ${message}`,
  bodyHint: 'Used verbatim as the system prompt; Markdown is supported.',
  advancedTitle: 'Advanced settings',
  deepHint: 'Leave empty to keep the default depth 1; 0 forbids this agent from dispatching sub-agents.',
  deepPlaceholder: 'Inherit (1)',
  backgroundHint: 'Leave empty to keep the default foreground; true means a continuous background session.',
  backgroundInheritOption: 'Inherit (foreground)',
  backgroundFalseOption: 'false (foreground)',
  backgroundTrueOption: 'true (background)',
  maxRoundsHint: 'Leave empty to inherit the global round limit; enter a positive integer.',
  maxRoundsPlaceholder: 'Inherit global',
  saving: 'Saving…',
  unsavedChanges: 'Unsaved changes',
  noChanges: 'No changes',
  cancel: 'Cancel',
  savePreset: 'Save preset',
  deleteConfirmTitle: id => `Delete ${id}.md?`,
  displayNameConfirmTitle: 'Confirm display name change',
  discardConfirmTitle: 'Discard unsaved changes?',
  closeLabel: 'Cancel confirmation',
  confirmDelete: 'Confirm delete',
  confirmSave: 'Confirm and save',
  discardChanges: 'Discard changes',
  deleteConfirmText: id => `${id}.md will be deleted. Every profile pointing at this directory loses this preset; it cannot be restored from this page after deletion.`,
  displayNameConfirmText: 'Adding, clearing or changing the display name changes the label used to find historical tasks. Old tasks may no longer be continued or followed up by name; history is not migrated.',
  discardRefreshText: 'Refreshing discards the current input and re-reads the directory.',
  discardRepairText: 'The current form input will be discarded and the full source read at load time will open.',
  discardListText: 'Returning to the list discards the current input.',
  confirmTarget: id => `Target: ${id}.md`,
  deletedNotice: id => `Deleted ${id}.md`,
  savedNotice: id => `Saved ${id}.md`,
}

const tables: Record<Language, Strings> = { zh, en, ru }

/** Unknown or missing languages fall back to the Chinese defaults. */
export function stringsFor(lang: Language | undefined): Strings {
  return lang && (LANGUAGES as readonly string[]).includes(lang) ? tables[lang] : tables.zh
}
