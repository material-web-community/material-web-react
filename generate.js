#!/usr/bin/env node

const fs = require('fs').promises
const path = require('path')
const { execSync } = require('child_process')

/**
 * A constant variable that holds the URL of the Material Web repository.
 *
 * This URL points to the official GitHub repository for Material Web components,
 * which provides various Material Design components for web development.
 *
 * Value: 'https://github.com/material-components/material-web.git'
 */
const REPO_URL = 'https://github.com/material-components/material-web.git'

/**
 * Represents the name of the temporary directory used for storing
 * temporary files or data related to the application or process.
 *
 * This variable typically defines the directory location for
 * handling temporary resources and is often cleaned up after use
 * to avoid persistence of unnecessary data.
 *
 * @constant {string} TEMP_DIR
 */
const TEMP_DIR = 'temp-material-web'

/**
 * Represents the directory path where the output files or generated content are stored.
 * Used to define or locate the primary destination folder for file operations.
 *
 * @constant {string} OUTPUT_DIR
 */
const OUTPUT_DIR = 'src'

/**
 * Clones the specified Git repository into a temporary directory.
 *
 * @return {Promise<void>} A promise that resolves when the repository is successfully cloned.
 */
async function cloneRepository() {
  console.log('Cloning material-web repository...')
  try {
    execSync(`git clone ${REPO_URL} ${TEMP_DIR}`, { stdio: 'inherit' })
    console.log('Repository cloned successfully')
  } catch (error) {
    console.error('Failed to clone repository:', error.message)
    process.exit(1)
  }
}

/**
 * Analyzes the structure of components within a specified temporary directory, identifying component directories
 * and gathering variant information for each component found.
 *
 * @return {Promise<Array<Object>>} A promise that resolves to an array of objects, each representing a component.
 * Each object includes the component name and its array of variants.
 */
async function analyzeComponentStructure() {
  console.log('Analyzing component structure...')
  const componentsPath = path.join(TEMP_DIR)
  const entries = await fs.readdir(componentsPath, { withFileTypes: true })

  const components = []
  for (const entry of entries) {
    if (
      entry.isDirectory() &&
      !entry.name.startsWith('.') &&
      !['docs', 'testing', 'tokens', 'scripts', 'catalog'].includes(entry.name)
    ) {
      const componentPath = path.join(componentsPath, entry.name)
      const variants = await findAllComponentVariants(componentPath, entry.name)

      if (variants.length > 0) {
        components.push({
          name: entry.name, // Use folder name (e.g., 'button', 'field')
          variants, // All variants in this folder
        })
      }
    }
  }

  return components
}

/**
 * Finds and retrieves all the component variants, including their metadata such as class name, tag name,
 * documentation, and associated events, from the specified directory.
 *
 * @param {string} componentPath - The file path of the directory containing the component files.
 * @param {string} componentName - The name of the component to locate and retrieve variants for.
 * @return {Promise<Object[]>} A promise that resolves to an array of objects, where each object contains
 * information about a component variant (e.g., file name, class name, tag name, import path, events,
 * documentation, and property details). If an error occurs, an empty array is returned.
 */
async function findAllComponentVariants(componentPath, componentName) {
  try {
    const files = await fs.readdir(componentPath)
    const variants = []

    for (const file of files) {
      if (file.endsWith('.ts') && !file.includes('internal') && !file.includes('test') && !file.includes('demo')) {
        const filePath = path.join(componentPath, file)
        const content = await fs.readFile(filePath, 'utf-8')

        if (content.includes('@customElement') && content.includes('export class')) {
          const className = extractClassName(content)
          const tagName = extractTagName(content)
          const { documentation, propertyDocs } = extractDocumentation(content)

          if (className && tagName) {
            // Extract events from internal implementation
            const events = await extractEvents(componentPath)

            variants.push({
              fileName: file.replace('.ts', ''),
              className,
              tagName,
              importPath: `@material/web/${componentName}/${file.replace('.ts', '.js')}`,
              events,
              documentation,
              propertyDocs,
            })
          }
        }
      }
    }

    return variants
  } catch (error) {
    return []
  }
}

/**
 * Extracts the class name from the given content string if it matches the expected pattern.
 *
 * @param {string} content - The string content to search for a class declaration.
 * @return {string | null} The extracted class name if a match is found; otherwise, null.
 */
function extractClassName(content) {
  const match = content.match(/export class (Md\w+)/)
  return match ? match[1] : null
}

/**
 * Extracts the tag name from the provided content string, specifically searching
 * for a pattern that matches a custom element definition using the `@customElement` decorator.
 *
 * @param {string} content - The string content to parse for the custom element tag name.
 * @return {string|null} The extracted tag name if found; otherwise, null.
 */
function extractTagName(content) {
  const match = content.match(/@customElement\(['"`]([^'"`]+)['"`]\)/)
  return match ? match[1] : null
}

/**
 * Extracts event names from TypeScript files located in the 'internal' directory
 * of the specified component path. The method looks for `@fires` JSDoc comments
 * within the files and maps the extracted event names to React-style event
 * handler names.
 *
 * @param {string} componentPath - The file path to the component directory.
 * @return {Promise<Object>} A promise that resolves to an object where the keys are
 * React-style event handler names (e.g., `onEventName`) and the values are the
 * original event names extracted from the JSDoc comments. Returns an empty
 * object if no events are found or an error occurs.
 */
async function extractEvents(componentPath) {
  try {
    const internalPath = path.join(componentPath, 'internal')
    const files = await fs.readdir(internalPath)

    for (const file of files) {
      if (file.endsWith('.ts') && !file.includes('styles') && !file.includes('test')) {
        const filePath = path.join(internalPath, file)
        const content = await fs.readFile(filePath, 'utf-8')

        // Look for @fires JSDoc comments to extract events
        const fireMatches = content.matchAll(/@fires\s+(\w+)\s+\{[^}]*\}\s*([^@\n]*)/g)
        const events = {}

        for (const match of fireMatches) {
          const eventName = match[1]
          const reactEventName = `on${eventName.charAt(0).toUpperCase()}${eventName.slice(1)}`
          events[reactEventName] = eventName
        }

        return events
      }
    }

    return {}
  } catch (error) {
    return {}
  }
}

/**
 * Extracts and processes JSDoc comments present in the provided content string.
 * This includes the main class documentation and property-level documentation.
 *
 * @param {string} content - The source text containing JSDoc comments to be extracted and processed.
 * @return {Object} An object containing `documentation` (class-level documentation as a string)
 *                  and `propertyDocs` (an object where keys are property names and values are their respective documentation strings).
 */
function extractDocumentation(content) {
  // Extract the main class documentation
  const classDocMatch = content.match(/\/\*\*\s*([\s\S]*?)\s*\*\/\s*export class/)
  let documentation = ''

  if (classDocMatch) {
    const docContent = classDocMatch[1]
    // Clean up the JSDoc format
    documentation = docContent
      .split('\n')
      .map(line => line.replace(/^\s*\*\s?/, '').trim())
      .filter(line => line && !line.startsWith('@'))
      .join('\n')
  }

  // Extract property documentation
  const propertyDocs = {}
  const propertyMatches = content.matchAll(/\/\*\*\s*([\s\S]*?)\s*\*\/\s*@property[^}]*?\s+(\w+)/g)

  for (const match of propertyMatches) {
    const docContent = match[1]
    const propertyName = match[2]
    const cleanDoc = docContent
      .split('\n')
      .map(line => line.replace(/^\s*\*\s?/, '').trim())
      .filter(line => line && !line.startsWith('@'))
      .join(' ')

    if (cleanDoc) {
      propertyDocs[propertyName] = cleanDoc
    }
  }

  return { documentation, propertyDocs }
}

/**
 * Extracts information about a web component from the specified file.
 *
 * @param {string} filePath - The path to the file containing the component definition.
 * @param {string} componentName - The name of the component to extract information for.
 * @return {Promise<Object|null>} A promise that resolves to an object containing the extracted component
 * information, including `className`, `tagName`, `documentation`, and `propertyDocs`, or `null`
 * if the information cannot be extracted.
 */
async function extractComponentInfo(filePath, componentName) {
  try {
    const content = await fs.readFile(filePath, 'utf-8')

    if (content.includes('@customElement') && content.includes('export class')) {
      const className = extractClassName(content)
      const tagName = extractTagName(content)
      const { documentation, propertyDocs } = extractDocumentation(content)

      if (className && tagName) {
        return {
          className,
          tagName,
          documentation,
          propertyDocs,
        }
      }
    }

    return null
  } catch (error) {
    return null
  }
}

/**
 * Generates a React wrapper for Material Web components based on the provided component configuration.
 *
 * @param {Object} component - The configuration object for the Material Web component.
 * @param {string} component.name - The name of the component.
 * @param {Array} component.variants - The list of variants for the component, where each variant includes details like className, importPath, tagName, events, and documentation.
 * @param {Object} [component.propertyDocs] - Documentation for properties of the component's variants.
 * @param {string} [component.variants[].className] - The class name for the variant.
 * @param {string} [component.variants[].importPath] - The import path for the variant.
 * @param {string} [component.variants[].tagName] - The custom element tag name for the variant.
 * @param {Object} [component.variants[].events] - The event mappings for the variant, where keys are React event names and values are native event names.
 * @param {string} [component.variants[].documentation] - Documentation for the variant component.
 *
 * @return {string} A string representing the generated React wrapper code for the specified Material Web components. If no variants are present, an empty string is returned.
 */
function generateReactWrapper(component) {
  const variants = component.variants
  if (!variants || variants.length === 0) return ''

  const timestamp = new Date().toISOString()
  const header = `/**
 * @fileoverview React wrappers for Material Web ${component.name} components
 * 
 * This file was auto-generated on ${timestamp}
 * 
 * DO NOT EDIT MANUALLY - This file is generated by generate.js
 * To regenerate, run: npm run generate
 * 
 * @generated
 */`

  const imports = variants
    .map(variant => `import { ${variant.className} as _${variant.className} } from '${variant.importPath}'`)
    .join('\n')

  const typeDefinitions = variants
    .map(
      variant => `
/**
 * Props for the \`${variant.className}\` component.
 * This interface is used to provide the props for the \`${variant.className}\` component.
 *
 */
export type ${variant.className}Props = ComponentProps<typeof ${variant.className}>`
    )
    .join('\n')

  const elementInterfaces = variants
    .map(
      variant => `
export interface ${variant.className}Element extends _${variant.className} {}`
    )
    .join('\n')

  const componentDefinitions = variants
    .map(variant => {
      const eventsObj =
        Object.keys(variant.events).length > 0
          ? `{\n        ${Object.entries(variant.events)
              .map(([reactEvent, nativeEvent]) => `${reactEvent}: '${nativeEvent}'`)
              .join(',\n        ')},\n    }`
          : '{}'

      // Generate parameter documentation from property docs
      const paramDocs = Object.entries(variant.propertyDocs)
        .map(([prop, doc]) => ` * @param {any} ${prop} - ${doc}`)
        .join('\n')

      const fullDocumentation = variant.documentation
        ? `${variant.documentation}\n *\n * @component\n${paramDocs}`
        : `Material Design ${variant.className
            .replace('Md', '')
            .replace(/([A-Z])/g, ' $1')
            .trim()} component.\n * This component is a React wrapper around the \`${variant.tagName}\` custom element.\n *\n * @component\n${paramDocs}`

      return `
/**
 * ${fullDocumentation}
 */
export const ${variant.className} = createComponent({
    react: React,
    tagName: '${variant.tagName}',
    elementClass: _${variant.className},
    events: ${eventsObj},
})`
    })
    .join('\n')

  return `${header}

'use client'

import { createComponent } from '@lit/react'
import React, { ComponentProps } from 'react'
${imports}
${typeDefinitions}
${elementInterfaces}
${componentDefinitions}
`
}

/**
 * Creates the output directory structure based on the provided components and their variants.
 * This function ensures that the necessary directory structure is created, generates React wrappers for components,
 * and writes them to their respective directories. It also generates a main index file to export all components.
 *
 * @param {Array} components - An array of component objects. Each component object should contain a `name` and `variants`.
 *                             The `variants` should describe the different styles or versions of the component.
 * @return {Promise<void>} A promise that resolves when all directories, files, and the main index file have been successfully created.
 */
async function createOutputStructure(components) {
  console.log('Creating output directory structure...')

  // Ensure output directory exists
  await fs.mkdir(OUTPUT_DIR, { recursive: true })

  const allExports = []

  for (const component of components) {
    const componentDir = path.join(OUTPUT_DIR, component.name)
    await fs.mkdir(componentDir, { recursive: true })

    const wrapperContent = generateReactWrapper(component)
    const indexPath = path.join(componentDir, 'index.tsx')

    await fs.writeFile(indexPath, wrapperContent)
    console.log(`Generated ${indexPath}`)

    // Collect exports for main index
    component.variants.forEach(variant => {
      allExports.push({
        componentName: variant.className,
        propsName: `${variant.className}Props`,
        elementName: `${variant.className}Element`,
        folder: component.name,
      })
    })
  }

  // Generate main index.ts
  await generateMainIndex(allExports)
}

/**
 * Generates the main index.ts file for all Material Web React components.
 * This function automatically constructs an export file for components based on the provided input data.
 *
 * @param {Array<Object>} allExports - An array of export objects containing details about each component.
 * @param {string} allExports[].componentName - The name of the component to be exported.
 * @param {string} allExports[].propsName - The name of the props type associated with the component.
 * @param {string} allExports[].elementName - The name of the type representing the component's element.
 * @param {string} allExports[].folder - The folder path where the component is located.
 *
 * @return {Promise<void>} A promise that resolves when the index file is successfully written.
 */
async function generateMainIndex(allExports) {
  console.log('Generating main index.ts...')

  const exports = allExports
    .map(
      exp => `export { ${exp.componentName}, type ${exp.propsName}, type ${exp.elementName} } from './${exp.folder}'`
    )
    .join('\n')

  const timestamp = new Date().toISOString()
  const indexContent = `/**
 * @fileoverview Main exports for all Material Web React components
 * 
 * This file was auto-generated on ${timestamp}
 * 
 * DO NOT EDIT MANUALLY - This file is generated by generate.js
 * To regenerate, run: npm run generate
 * 
 * @generated
 */

${exports}
`

  const mainIndexPath = path.join(OUTPUT_DIR, 'index.ts')
  await fs.writeFile(mainIndexPath, indexContent)
  console.log(`Generated ${mainIndexPath}`)
}

/**
 * Asynchronously performs cleanup of temporary files from the specified directory.
 * Attempts to remove all files and directories within the temporary folder.
 * Logs success or failure of the operation to the console.
 *
 * @return {Promise<void>} A promise that resolves when the cleanup is complete.
 */
async function cleanup() {
  console.log('Cleaning up temporary files...')
  try {
    await fs.rm(TEMP_DIR, { recursive: true, force: true })
    console.log('Cleanup completed')
  } catch (error) {
    console.warn('Failed to cleanup:', error.message)
  }
}

/**
 * Main entry point to execute the React wrapper generation process. This function:
 * 1. Clones the required repository.
 * 2. Analyzes the component structure of the cloned repository.
 * 3. Generates a wrapper for each identified component.
 * 4. Cleans up temporary files or folders created during the process.
 *
 * @return {Promise<void>} A promise that resolves when the React wrapper generation process completes successfully, or terminates the process with an error.
 */
async function main() {
  try {
    await cloneRepository()
    const components = await analyzeComponentStructure()
    console.log(`Found ${components.length} components to generate wrappers for`)

    await createOutputStructure(components)
    await cleanup()

    console.log('React wrapper generation completed successfully!')
    console.log(`Generated components in ${OUTPUT_DIR}`)
  } catch (error) {
    console.error('Error:', error.message)
    process.exit(1)
  }
}

if (require.main === module) {
  main()
}
