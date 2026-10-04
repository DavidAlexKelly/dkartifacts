/**
 * @acc/decho-countries/react — a hook to load the data in a component.
 *
 * No UI: how a country's facts look is the app's call. The core exports what
 * a panel needs — figuresOf, orderedFigureKeys, FIGURE_LABELS, formatFigure,
 * flagEmoji — and the dataset's manifest carries the sources to credit.
 */

export { useCountries, type UseCountriesResult } from "./useCountries.js";
