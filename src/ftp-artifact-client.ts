import FTPClient from 'ftp'
import * as core from '@actions/core'
import * as fs from 'fs'
import * as path from 'path'
import {
  ArtifactClient,
  DownloadOptions,
  DownloadResponse,
  UploadOptions,
  UploadResponse
} from '@actions/artifact'

const run_id: string = process.env['GITHUB_RUN_ID'] ?? '0'

class FTPArtifactClient implements ArtifactClient {
  private host: string
  private port: number
  private username: string
  private password: string
  private remotePath: string

  constructor(
    host: string,
    port: number,
    username: string,
    password: string,
    remotePath?: string
  ) {
    this.host = host
    this.port = port
    this.username = username
    this.password = password
    this.remotePath = remotePath ?? '/'
  }

  uploadArtifact(
    name: string,
    files: string[],
    rootDirectory: string,
    options?: UploadOptions | undefined
  ): Promise<UploadResponse> {
    throw new Error('Method not implemented.')
  }

  async downloadArtifact(
    name: string,
    resolvedPath: string,
    downloadOptions: DownloadOptions
  ): Promise<DownloadResponse> {
    const client = new FTPClient()
    await new Promise<void>((resolve, reject) => {
      client.once('ready', resolve)
      client.once('error', reject)
      client.connect({
        host: this.host,
        port: this.port,
        user: this.username,
        password: this.password
      })
    })

    const response = await this.downloadArtifactInternal(
      client,
      name,
      resolvedPath,
      downloadOptions
    )

    client.end()

    return response
  }

  async downloadAllArtifacts(
    resolvedPath?: string
  ): Promise<DownloadResponse[]> {
    const client = new FTPClient()
    await new Promise<void>((resolve, reject) => {
      client.once('ready', resolve)
      client.once('error', reject)
      client.connect({
        host: this.host,
        port: this.port,
        user: this.username,
        password: this.password
      })
    })

    const serverSideArtifactsBasePath = path.join(this.remotePath, run_id)

    if (resolvedPath === undefined) {
      resolvedPath = process.cwd()
    }

    const artifactsList = await new Promise<FTPClient.ListingElement[]>(
      (resolve, reject) => {
        client.list(serverSideArtifactsBasePath, (err, list) => {
          if (err) {
            reject(err)
          } else {
            resolve(list)
          }
        })
      }
    )

    const responses: DownloadResponse[] = []
    for (const file of artifactsList) {
      if (file.type === 'd') {
        const result = await this.downloadArtifactInternal(
          client,
          file.name,
          resolvedPath,
          {createArtifactFolder: true}
        )
        responses.push(result)
      }
    }

    client.end()

    return responses
  }

  async downloadArtifactInternal(
    client: FTPClient,
    name: string,
    resolvedPath: string,
    downloadOptions: DownloadOptions
  ): Promise<DownloadResponse> {
    const serverSideArtifactPath = path.join(this.remotePath, run_id, name)

    if (downloadOptions.createArtifactFolder) {
      resolvedPath = path.join(resolvedPath, name)
      fs.mkdirSync(resolvedPath, {recursive: true})
    }

    const filesToDownload: string[] = []

    await this.listToDownloadFilesRecursive(
      client,
      serverSideArtifactPath,
      filesToDownload
    )

    for (const serverSideFilePath of filesToDownload) {
      await new Promise<void>((resolve, reject) => {
        client.get(serverSideFilePath, (err, downloadStream) => {
          if (err) {
            reject(err)
          }
          const pathInArtifact = path.relative(
            serverSideArtifactPath,
            serverSideFilePath
          )
          const localFilePath = path.join(resolvedPath, pathInArtifact)
          core.info(`Downloading: ${pathInArtifact}`)
          fs.mkdirSync(path.dirname(localFilePath), {recursive: true})
          const writeStream = fs.createWriteStream(localFilePath, {
            autoClose: true
          })
          downloadStream.pipe(writeStream)
          downloadStream.once('error', reject)
          writeStream.once('error', reject)
          writeStream.once('finish', resolve)
        })
      })
    }
    return {
      artifactName: name,
      downloadPath: resolvedPath
    } as DownloadResponse
  }

  async listToDownloadFilesRecursive(
    client: FTPClient,
    currentDir: string,
    filesToDownload: string[]
  ): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      client.list(currentDir, (err, list) => {
        if (err) {
          reject(err)
        }
        try {
          for (const file of list) {
            if (file.type === 'd') {
              this.listToDownloadFilesRecursive(
                client,
                path.join(currentDir, file.name),
                filesToDownload
              )
            } else {
              filesToDownload.push(path.join(currentDir, file.name))
            }
          }
        } catch (err) {
          reject(err)
        }
        resolve()
      })
    })
  }
}

export function create(
  host: string,
  port: number,
  username: string,
  password: string,
  remotePath?: string
): FTPArtifactClient {
  return new FTPArtifactClient(host, port, username, password, remotePath)
}
