import {
  AddEventsBehaviour,
  AlloyComponent,
  AlloyEvents,
  AlloyTriggers,
  Behaviour,
  Button as AlloyButton,
  Disabling,
  Focusing,
  Keying,
  NativeEvents,
  Reflecting,
  Replacing,
  SketchSpec,
  SplitDropdown as AlloySplitDropdown,
  Toggling,
} from '@ephox/alloy';
import { BehaviourConfigDetail, BehaviourConfigSpec } from '@ephox/alloy/lib/main/ts/ephox/alloy/api/behaviour/Behaviour';
import { PartialMenuSpec } from '@ephox/alloy/lib/main/ts/ephox/alloy/ui/types/TieredMenuTypes';
import { Toolbar, Types } from '@ephox/bridge';
import { Cell, Fun, Future, Id, Merger, Option } from '@ephox/katamari';
import { Attr, SelectorFind } from '@ephox/sugar';
import { ToolbarButtonClasses } from 'tinymce/themes/silver/ui/toolbar/button/ButtonClasses';
import { onToolbarButtonExecute, toolbarButtonEventOrder } from 'tinymce/themes/silver/ui/toolbar/button/ButtonEvents';

import { UiFactoryBackstageProviders, UiFactoryBackstageShared } from '../../../backstage/Backstage';
import { DisablingConfigs } from '../../alien/DisablingConfigs';
import { detectSize } from '../../alien/FlatgridAutodetect';
import { SimpleBehaviours } from '../../alien/SimpleBehaviours';
import { renderIconFromPack, renderLabel } from '../../button/ButtonSlices';
import { onControlAttached, onControlDetached, OnDestroy } from '../../controls/Controls';
import * as Icons from '../../icons/Icons';
import { componentRenderPipeline } from '../../menus/item/build/CommonMenuItem';
import { classForPreset } from '../../menus/item/ItemClasses';
import { deriveMenuMovement } from '../../menus/menu/MenuMovement';
import * as MenuParts from '../../menus/menu/MenuParts';
import { createPartialChoiceMenu, createTieredDataFrom } from '../../menus/menu/SingleMenu';
import ItemResponse from '../../menus/item/ItemResponse';

interface Specialisation<T> {
  toolbarButtonBehaviours: Array<Behaviour.NamedConfiguredBehaviour<BehaviourConfigSpec, BehaviourConfigDetail>>;
  getApi: (comp: AlloyComponent) => T;
  onSetup: (api: T) => OnDestroy<T>;
}

const getButtonApi = (component): Toolbar.ToolbarButtonInstanceApi => {
  return {
    isDisabled: () => Disabling.isDisabled(component),
    setDisabled: (state) => state ? Disabling.disable(component) : Disabling.enable(component)
  };
};

const getToggleApi = (component): Toolbar.ToolbarToggleButtonInstanceApi => {
  return {
    setActive: (state) => {
      Toggling.set(component, state);
    },
    isActive: () => Toggling.isOn(component),
    isDisabled: () => Disabling.isDisabled(component),
    setDisabled: (state) => state ? Disabling.disable(component) : Disabling.enable(component)
  };
};

interface GeneralToolbarButton<T> {
  icon: Option<string>;
  text: Option<string>;
  tooltip: Option<string>;
  onAction: (api: T) => void;
  disabled: boolean;
}

const focusButtonEvent = Id.generate('focus-button');

const renderCommonStructure = (icon: Option<string>, text: Option<string>, tooltip: Option<string>, receiver: Option<string>, providersBackstage: UiFactoryBackstageProviders) => {
  const tooltipAttributes = tooltip.map<{}>((tooltip) => ({
    'aria-label': providersBackstage.translate(tooltip),
    'title': providersBackstage.translate(tooltip)
  })).getOr({});

  return {
    dom: {
      tag: 'button',
      classes: [ ToolbarButtonClasses.Button ].concat(text.isSome() ? [ ToolbarButtonClasses.MatchWidth ] : []),
      attributes: tooltipAttributes
    },
    components: componentRenderPipeline([
      icon.map((iconName) => renderIconFromPack(iconName, providersBackstage.icons)),
      text.map((text) => renderLabel(text, ToolbarButtonClasses.Button, providersBackstage))
    ]),

    eventOrder: {
      [NativeEvents.mousedown()]: [
        'focusing',
        'alloy.base.behaviour',
        'common-button-display-events'
      ]
    },

    buttonBehaviours: Behaviour.derive(
      [
        AddEventsBehaviour.config('common-button-display-events', [
          AlloyEvents.run(NativeEvents.mousedown(), (button, se) => {
            se.event().prevent();
            AlloyTriggers.emit(button, focusButtonEvent);
          })
        ])
      ].concat(
        receiver.map((r) => {
          return Reflecting.config({
            channel: r,
            initialData: { icon, text },
            renderComponents: (data, _state) => {
              return componentRenderPipeline([
                data.icon.map((iconName) => renderIconFromPack(iconName, providersBackstage.icons)),
                data.text.map((text) => renderLabel(text, ToolbarButtonClasses.Button, providersBackstage))
              ]);
            }
          });
        }).toArray()
      )
    )
  };
};

const renderCommonToolbarButton = <T>(spec: GeneralToolbarButton<T>, specialisation: Specialisation<T>, providersBackstage: UiFactoryBackstageProviders) => {
  const editorOffCell = Cell(Fun.noop);
  const structure = renderCommonStructure(spec.icon, spec.text, spec.tooltip, Option.none(), providersBackstage);
  return AlloyButton.sketch({
    dom: structure.dom,
    components: structure.components,

    eventOrder: toolbarButtonEventOrder,
    buttonBehaviours: Behaviour.derive(
      [
        AddEventsBehaviour.config('toolbar-button-events', [
          onToolbarButtonExecute<T>({
            onAction: spec.onAction,
            getApi: specialisation.getApi
          }),
          onControlAttached(specialisation, editorOffCell),
          onControlDetached(specialisation, editorOffCell),
        ]),
        DisablingConfigs.button(spec.disabled)
      ].concat(specialisation.toolbarButtonBehaviours)
    )
  });
};

const renderToolbarButton = (spec: Toolbar.ToolbarButton, providersBackstage: UiFactoryBackstageProviders) => {
  return renderToolbarButtonWith(spec, providersBackstage, [ ]);
};

const renderToolbarButtonWith = (spec: Toolbar.ToolbarButton, providersBackstage: UiFactoryBackstageProviders, bonusEvents: AlloyEvents.AlloyEventKeyAndHandler<any>[]) => {
  return renderCommonToolbarButton(spec, {
    toolbarButtonBehaviours: [ ].concat(bonusEvents.length > 0 ? [
      // TODO: May have to pass through eventOrder if events start clashing
      AddEventsBehaviour.config('toolbarButtonWith', bonusEvents)
    ] : [ ]) ,
    getApi: getButtonApi,
    onSetup: spec.onSetup
  }, providersBackstage);
};

const renderToolbarToggleButton = (spec: Toolbar.ToolbarToggleButton, providersBackstage: UiFactoryBackstageProviders) => {
  return renderToolbarToggleButtonWith(spec, providersBackstage, [ ]);
};

const renderToolbarToggleButtonWith = (spec: Toolbar.ToolbarToggleButton, providersBackstage: UiFactoryBackstageProviders, bonusEvents: AlloyEvents.AlloyEventKeyAndHandler<any>[]) => {
  return Merger.deepMerge(
    renderCommonToolbarButton(spec,
      {
        toolbarButtonBehaviours: [
          Replacing.config({ }),
          Toggling.config({ toggleClass: ToolbarButtonClasses.Ticked, aria: { mode: 'pressed' }, toggleOnExecute: false })
        ].concat(bonusEvents.length > 0 ? [
          // TODO: May have to pass through eventOrder if events start clashing
          AddEventsBehaviour.config('toolbarToggleButtonWith', bonusEvents)

        ] : [ ]),
        getApi: getToggleApi,
        onSetup: spec.onSetup
      },
      providersBackstage
    )
  ) as SketchSpec;
};

interface ChoiceFetcher {
  fetch: (callback: Function) => void;
  columns: 'auto' | number;
  presets: Types.PresetTypes;
  onItemAction: (api: Toolbar.ToolbarSplitButtonInstanceApi, value: string) => void;
  select: Option<(value: string) => boolean>;
}

const fetchChoices = (getApi, spec: ChoiceFetcher, providersBackstage: UiFactoryBackstageProviders) => {
  return (comp: AlloyComponent) => {
    return Future.nu((callback) => {
      return spec.fetch(callback);
    }).map((items) => {
      return createTieredDataFrom(
        Merger.deepMerge(
          createPartialChoiceMenu(
            Id.generate('menu-value'),
            items,
            (value) => {
              spec.onItemAction(getApi(comp), value);
            },
            spec.columns,
            spec.presets,
            ItemResponse.CLOSE_ON_EXECUTE,
            spec.select.getOr(() => false),
            providersBackstage
          ),
          {
            movement: deriveMenuMovement(spec.columns, spec.presets),
            menuBehaviours: SimpleBehaviours.unnamedEvents(spec.columns !== 'auto' ? [ ] : [
              AlloyEvents.runOnAttached((comp, se) => {
                detectSize(comp, 4, classForPreset(spec.presets)).each(({ numRows, numColumns }) => {
                  Keying.setGridSize(comp, numRows, numColumns);
                });
              })
            ])
          } as PartialMenuSpec
        )
      );
    });
  };
};

// TODO: hookup onSetup and onDestroy
const renderSplitButton = (spec: Toolbar.ToolbarSplitButton, sharedBackstage: UiFactoryBackstageShared): SketchSpec => {
  // This is used to change the icon on the button. Normally, affected by the select call.
  const displayChannel = Id.generate('channel-update-split-dropdown-display');

  const getApi = (comp: AlloyComponent): Toolbar.ToolbarSplitButtonInstanceApi => {
    return {
      isDisabled: () => true,
      setDisabled: () => {},
      setIconFill: (id, value) => {
        SelectorFind.descendant(comp.element(), 'svg path[id="' + id + '"], rect[id="' + id + '"]').each((underlinePath) => {
          Attr.set(underlinePath, 'fill', value);
        });
      },
      setIconStroke: (id, value) => {
        SelectorFind.descendant(comp.element(), 'svg path[id="' + id + '"], rect[id="' + id + '"]').each((underlinePath) => {
          Attr.set(underlinePath, 'stroke', value);
        });
      },
      setActive: (state) => {
        Toggling.set(comp, state);
      },
      isActive: () => Toggling.isOn(comp),
    };
  };

  const editorOffCell = Cell(Fun.noop);
  const specialisation = {
    getApi,
    onSetup: spec.onSetup
  };
  return AlloySplitDropdown.sketch({
    dom: {
      tag: 'div',
      classes: [ ToolbarButtonClasses.SplitButton ]
    },

    onExecute (button: AlloyComponent) {
      spec.onAction(getApi(button));
    },

    onItemExecute: (a, b, c) => { },

    splitDropdownBehaviours: Behaviour.derive([
      Toggling.config({ toggleClass: ToolbarButtonClasses.Ticked, toggleOnExecute: false }),
      AddEventsBehaviour.config('split-dropdown-events', [
        AlloyEvents.run(focusButtonEvent, Focusing.focus),
        onControlAttached(specialisation, editorOffCell),
        onControlDetached(specialisation, editorOffCell),
      ])
    ]),

    // FIX: this.
    toggleClass: 'mce-active',
    lazySink: sharedBackstage.getSink,
    fetch: fetchChoices(getApi, spec, sharedBackstage.providers),

    parts: {
      // FIX: hasIcons
      menu: MenuParts.part(false, spec.columns, spec.presets)
    },

    components: [
      AlloySplitDropdown.parts().button(
        renderCommonStructure(spec.icon, spec.text, spec.tooltip, Option.some(displayChannel), sharedBackstage.providers)
      ),
      AlloySplitDropdown.parts().arrow({
        dom: {
          tag: 'button',
          classes: [ ToolbarButtonClasses.Button, 'tox-split-button__chevron' ],
          innerHtml: Icons.getOr('icon-chevron-down', sharedBackstage.providers.icons, Fun.constant(''))
        }
      })
    ]
  });
};

export {
  renderCommonStructure,
  renderToolbarButton,
  renderToolbarButtonWith,
  renderToolbarToggleButton,
  renderToolbarToggleButtonWith,
  renderSplitButton
};