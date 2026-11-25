import { useId, useState } from 'react'
import type { BrowserCoordinates } from '../../../shared/api'
import map from './browser-map.json'

interface Props {
  readonly point: BrowserCoordinates | undefined
  readonly disabled: boolean
  readonly onPick: (point: BrowserCoordinates) => void
}

const clamp = (value: number, lower: number, upper: number): number => Math.min(upper, Math.max(lower, value))
const rounded = (value: number): number => Math.round(value * 100_000) / 100_000

export default function BrowserLocationMap({ point, disabled, onPick }: Props): React.JSX.Element {
  const cityId = useId()
  const [zoom, setZoom] = useState(1)
  const [center, setCenter] = useState(point)
  const width = 360 / zoom
  const height = 180 / zoom
  const left = clamp((center?.longitude ?? 0) - width / 2, -180, 180 - width)
  const top = clamp(-(center?.latitude ?? 0) - height / 2, -90, 90 - height)
  const cityIndex = map.cities.findIndex((city) => city.latitude === point?.latitude && city.longitude === point?.longitude)
  const zoomBy = (ratio: number): void => {
    setCenter(point)
    setZoom((value) => clamp(value * ratio, 1, 16))
  }
  return <div className="browser-location-map-group">
    <div className="browser-location-city">
      <label htmlFor={cityId}>Find a city</label>
      <select id={cityId} value={cityIndex < 0 ? '' : cityIndex} disabled={disabled} onChange={(event) => {
        if (event.target.value === '') return
        const city = map.cities[Number(event.target.value)]
        if (city === undefined) return
        setCenter(city)
        setZoom(4)
        onPick(city)
      }}>
        <option value="">Choose a city</option>
        {map.cities.map((city, index) => <option key={index} value={index}>{city.name}, {city.region}</option>)}
      </select>
    </div>
    <div className="browser-location-viewport">
      <button type="button" className="browser-location-map" aria-label="Choose a point on the world map. Press Enter to select the map center." disabled={disabled} onClick={(event) => {
        const box = event.currentTarget.getBoundingClientRect()
        const x = event.detail === 0 ? 0.5 : (event.clientX - box.left) / box.width
        const y = event.detail === 0 ? 0.5 : (event.clientY - box.top) / box.height
        const longitude = rounded(clamp(left + width * x, -180, 180))
        const latitude = rounded(clamp(-(top + height * y), -90, 90))
        onPick({ latitude, longitude })
      }}>
        <svg aria-hidden="true" viewBox={`${left} ${top} ${width} ${height}`}>
          <path className="browser-location-land" d={map.boundaries} fillRule="evenodd" vectorEffect="non-scaling-stroke" />
          {point === undefined ? null : <circle className="browser-location-pin" cx={point.longitude} cy={-point.latitude} r={width / 76} vectorEffect="non-scaling-stroke" />}
        </svg>
      </button>
      <div className="browser-location-zoom">
        <button type="button" className="quiet" aria-label="Zoom out" disabled={disabled || zoom === 1} onClick={() => zoomBy(0.5)}>−</button>
        <button type="button" className="quiet" aria-label="Zoom in" disabled={disabled || zoom === 16} onClick={() => zoomBy(2)}>+</button>
      </div>
    </div>
  </div>
}
