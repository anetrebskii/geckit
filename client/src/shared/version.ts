import release from '../../../.version?raw'
import { version as packaged } from '../../package.json'

export const version = packaged === '1.0.0' ? `${release.trim()}.0` : packaged
