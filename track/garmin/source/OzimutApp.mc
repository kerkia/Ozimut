// Ozimut — Connect IQ data field: the run sent live to ozimut.com (docs/track/design.md).
import Toybox.Application;
import Toybox.Lang;
import Toybox.WatchUi;

class OzimutApp extends Application.AppBase {

    function initialize() {
        AppBase.initialize();
    }

    function getInitialView() as [WatchUi.Views] or [WatchUi.Views, WatchUi.InputDelegates] {
        return [new OzimutField()];
    }
}
