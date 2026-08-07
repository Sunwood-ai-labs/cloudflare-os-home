function required(name) {
  const value = process.env[name]?.trim()
  if (!value) {
    throw new Error(`Set ${name} before running the browser QA flow.`)
  }
  return value
}

export const username = required('CFOS_USERNAME')
export const password = required('CFOS_PASSWORD')
