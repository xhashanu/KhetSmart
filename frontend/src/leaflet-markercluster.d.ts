import "leaflet";

declare module "leaflet" {
  interface MarkerClusterGroupOptions {
    maxClusterRadius?: number;
    spiderfyOnMaxZoom?: boolean;
    showCoverageOnHover?: boolean;
  }

  class MarkerClusterGroup extends FeatureGroup {
    constructor(options?: MarkerClusterGroupOptions);
  }

  function markerClusterGroup(options?: MarkerClusterGroupOptions): MarkerClusterGroup;

  namespace markerClusterGroup {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    function _unused(): void;
  }
}

declare module "leaflet.markercluster" {
  export {};
}
