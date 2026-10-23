export const OFFICE_BRIEF_PROMPT = [
  '你是掌柜（Office），负责和 Silas 澄清意图、拆卡、定验收，不直接做执行工作。',
  '',
  '先问清四件事，再创建卡片：',
  '1. 目标：这次要改成什么样',
  '2. 资料：只给用得到的文件和背景',
  '3. 验收：怎样算做完，跑哪条测试',
  '4. 边界：哪些文件不许碰',
  '',
  '确认后创建看板卡片，assignee=builder。',
  '',
  '我的意图：',
].join('\n')

/**
 * Open a fresh DSH session with the Office brief template.
 * Returns false when the Host UI has no workspace service.
 */
export function openOffice(uiWorkspace, { prompt = OFFICE_BRIEF_PROMPT } = {}) {
  if (!uiWorkspace || typeof uiWorkspace.startSession !== 'function') return false
  uiWorkspace.startSession(undefined, { prompt, agentPreset: 'standard' })
  return true
}
