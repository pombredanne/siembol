import { CdkTextareaAutosize } from '@angular/cdk/text-field';
import { AfterViewInit, Component, ElementRef, NgZone, OnDestroy, ViewChild } from '@angular/core';
import { FormControl } from '@angular/forms';
import { MatAutocompleteSelectedEvent, MatAutocompleteTrigger } from '@angular/material';
import { MatInput } from '@angular/material/input';
import { SensorFields } from '@app/model';
import { FieldType } from '@ngx-formly/material/form-field';
import { cloneDeep } from 'lodash';
import { Observable, Subject } from 'rxjs';
import { debounceTime, take, takeUntil, tap } from 'rxjs/operators';

@Component({
  // tslint:disable-next-line:component-selector
  selector: 'formly-field-mat-textarea',
  template: `
    <div class="overlay-holder">
        <mat-form-field #formfield>
            <mat-label>{{ to.label }}</mat-label>
            <textarea class="text-area" highlight matInput #textbox #autocompleteInput cdkTextareaAutosize #autosize="cdkTextareaAutosize"
            [matAutocomplete]="auto"
            [class.hide-text]="true"
            [id]="id"
            [name]="to.title"
            [readonly]="to.readonly"
            [formControl]="formControl"
            [errorStateMatcher]="errorStateMatcher"
            [formlyAttributes]="field"
            [placeholder]="to.placeholder"
            [tabindex]="to.tabindex || 0"
            [readonly]="to.readonly"
            >
            </textarea>
            <mat-autocomplete
                #auto="matAutocomplete" [autoActiveFirstOption]='true' (optionSelected)="autoCompleteSelected($event)"
            >
                <mat-optgroup *ngFor="let group of filteredList" [label]="group?.sensor_name">
                    <mat-option *ngFor="let field of group?.fields" [value]="field?.name">
                        {{field.name}}
                    </mat-option>
                </mat-optgroup>
            </mat-autocomplete>
            <mat-hint *ngIf="to?.description && (!to?.errorMessage)"
            align="end" [innerHTML]="to?.description"></mat-hint>
        </mat-form-field>
        <div class="highlighted-overlay" [class.show-overlay]="true" [innerHtml]="modelValue | highlightVariables"></div>
    </div>
  `,
  styles: [`
    .text-area {
        resize: none;
        line-height: normal;
        overflow: hidden;
    }

    mat-form-field {
        width: 100%;
    }

    .hide-text {
        -webkit-text-fill-color: transparent;
    }

    .show-overlay {
        display: block;
        width: 100%;
        overflow-wrap: break-word;
        white-space: pre-wrap;
    }

    .highlighted-overlay {
        position: absolute;
        top: 21px;
        left: 0;
        z-index: 10;
    }

    .overlay-holder {
        position: relative;
        line-height: normal;
        overflow: hidden;
    }

    ::ng-deep .overlay-holder .mat-input-element {
        position: relative;
        z-index: 20;
    }
  `],
})
export class TextAreaTypeComponent extends FieldType implements OnDestroy, AfterViewInit {
  @ViewChild(MatInput, {static: false}) formFieldControl!: MatInput;

  @ViewChild('textbox', {static: true}) textbox: ElementRef;
  @ViewChild('autocompleteInput', { read: MatAutocompleteTrigger, static: false }) autocomplete: MatAutocompleteTrigger;
  @ViewChild('formfield', {static: true}) formfield: FormControl;
  @ViewChild('autosize', {static: false}) autosize: CdkTextareaAutosize;

  public displayOverlay = true;
  public modelValue;
    sensorFields$: Observable<SensorFields[]>;
    autoCompleteList: SensorFields[];
    filteredList: SensorFields[] = [];
    sensorDataSource$: any;
    _value;

  private ngUnsubscribe: Subject<any> = new Subject();
  private readonly variableRegex = new RegExp(/\${([a-zA-Z_.:]*)(?![^ ]*})/);

  constructor(private ngZone: NgZone) {
      super();
  }

  triggerResize() {
    this.ngZone.onStable.pipe(take(1)).subscribe(() => this.autosize.resizeToFitContent(true));
  }

  ngOnDestroy() {
    this.ngUnsubscribe.next();
    this.ngUnsubscribe.complete();
  }

  ngAfterViewInit() {
    // populate the model value with the current form value
    this.modelValue = this.value;
    this.formControl.updateValueAndValidity();
    this.formControl.valueChanges.pipe(tap(v => {this.modelValue = v}), debounceTime(400), takeUntil(this.ngUnsubscribe)).subscribe(val => {
        if (val === null || val === undefined || !this.options.formState.sensorFields) {
            return;
        }
        this._value = val;
        this.autoCompleteList = this.options.formState.sensorFields;
        this.filteredList = cloneDeep(this.options.formState.sensorFields) || [];
        const matches = this.variableRegex.exec(val);
        if (matches != null && matches.length > 0) {
            for (let i = 0; i < this.options.formState.sensorFields.length; ++i) {
                this.filteredList[i].fields = this.options.formState.sensorFields[i].fields
                .filter(n => n.name.includes(matches[matches.length - 1]));
            }
            this.autocomplete.autocompleteDisabled = false;
            this.autocomplete.openPanel();
        } else {
            this.autocomplete.closePanel();
            this.autocomplete.autocompleteDisabled = true;
        }
    });
  }

  public autoCompleteSelected($event: MatAutocompleteSelectedEvent) {
    const replacementStr = this._value.replace(this.variableRegex, '${' + $event.option.value + '}');
    this.field.formControl.setValue(replacementStr);
  }
}