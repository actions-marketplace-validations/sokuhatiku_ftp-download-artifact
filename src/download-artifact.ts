import * as core from '@actions/core'
import * as artifact from './ftp-artifact-client'
import * as os from 'os'
import {resolve} from 'path'
import {Inputs, Outputs} from './constants'

async function run(): Promise<void> {
  try {
    const name = core.getInput(Inputs.Name, {required: false})
    const path = core.getInput(Inputs.Path, {required: false})
    const host = core.getInput(Inputs.Host, {required: true})
    const port = parseInt(core.getInput(Inputs.Port, {required: false}))
    const username = core.getInput(Inputs.Username, {required: true})
    const password = core.getInput(Inputs.Password, {required: true})
    const secure = Boolean(core.getInput(Inputs.Secure, {required: false}))
    const remotePath = core.getInput(Inputs.RemotePath, {required: false})

    let resolvedPath
    // resolve tilde expansions, path.replace only replaces the first occurrence of a pattern
    if (path.startsWith(`~`)) {
      resolvedPath = resolve(path.replace('~', os.homedir()))
    } else {
      resolvedPath = resolve(path)
    }
    core.debug(`Resolved path is ${resolvedPath}`)

    const artifactClient = artifact.create(
      host,
      port,
      username,
      password,
      secure,
      remotePath
    )
    if (!name) {
      // download all artifacts
      core.info('No artifact name specified, downloading all artifacts')
      core.info(
        'Creating an extra directory for each artifact that is being downloaded'
      )
      const downloadResponse = await artifactClient.downloadAllArtifacts(
        resolvedPath
      )
      core.info(`There were ${downloadResponse.length} artifacts downloaded`)
      for (const artifact of downloadResponse) {
        core.info(
          `Artifact ${artifact.artifactName} was downloaded to ${artifact.downloadPath}`
        )
      }
    } else {
      // download a single artifact
      core.info(`Starting download for ${name}`)
      const downloadOptions = {
        createArtifactFolder: false
      }
      const downloadResponse = await artifactClient.downloadArtifact(
        name,
        resolvedPath,
        downloadOptions
      )
      core.info(
        `Artifact ${downloadResponse.artifactName} was downloaded to ${downloadResponse.downloadPath}`
      )
    }
    // output the directory that the artifact(s) was/were downloaded to
    // if no path is provided, an empty string resolves to the current working directory
    core.setOutput(Outputs.DownloadPath, resolvedPath)
    core.info('Artifact download has finished successfully')
  } catch (err) {
    core.setFailed((err as Error).message)
  }
}

run()
