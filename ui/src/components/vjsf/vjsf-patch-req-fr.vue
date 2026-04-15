<script setup>
// @ts-nocheck

import { StatefulLayout } from '@json-layout/core/state'
import { ref, shallowRef, getCurrentInstance, useSlots, computed } from 'vue'
import { useElementSize } from '@vueuse/core'

import Tree from '@koumoul/vjsf/components/tree.vue'
import { useVjsf, emits } from '@koumoul/vjsf/composables/use-vjsf.js'
import '@koumoul/vjsf/styles/vjsf.css'


import sectionNode from '@koumoul/vjsf/components/nodes/section.vue'

import textfieldNode from '@koumoul/vjsf/components/nodes/text-field.vue'

import textareaNode from '@koumoul/vjsf/components/nodes/textarea.vue'

import switchNode from '@koumoul/vjsf/components/nodes/switch.vue'

import listNode from '@koumoul/vjsf/components/nodes/list.vue'

import oneofselectNode from '@koumoul/vjsf/components/nodes/one-of-select.vue'

import autocompleteNode from '@koumoul/vjsf/components/nodes/autocomplete.vue'


import localizeErrors from "ajv-i18n/localize/fr/index.js";
const schema26 = {"$id":"export0","$ref":"https://github.com/data-fair/registry/artefact-patch#/properties/privateAccess/anyOf/0/items/oneOf/0"};
const schema28 = {"title":"Organisation","required":["type","id"],"additionalProperties":false,"properties":{"type":{"type":"string","const":"organization","__pointer":"https://github.com/data-fair/registry/artefact-patch#/properties/privateAccess/anyOf/0/items/oneOf/0/properties/type","errorMessage":{}},"id":{"type":"string","title":"Organisation","layout":{"getItems":{"url":{"type":"js-tpl","expr":"/simple-directory/api/organizations?size=20","pure":true,"dataAlias":"value","ref":4},"qSearchParam":"q","itemsResults":{"type":"js-eval","expr":"data.results","pure":true,"dataAlias":"body","ref":8},"itemTitle":{"type":"js-eval","expr":"`${item.name} (${item.id})`","pure":true,"dataAlias":"item","ref":5},"itemValue":{"type":"js-eval","expr":"item.id","pure":true,"dataAlias":"item","ref":6},"itemIcon":{"type":"js-eval","expr":"`/simple-directory/api/avatars/organization/${item.id}/avatar.png`","pure":true,"dataAlias":"item","ref":7}}},"__pointer":"https://github.com/data-fair/registry/artefact-patch#/properties/privateAccess/anyOf/0/items/oneOf/0/properties/id","errorMessage":{}}},"type":"object","__pointer":"https://github.com/data-fair/registry/artefact-patch#/properties/privateAccess/anyOf/0/items/oneOf/0","errorMessage":{"required":{"type":"information obligatoire","id":"information obligatoire"}}};
const obj0 = {"required":"missingProperty","dependencies":"property","dependentRequired":"property"};

function validate22(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
/*# sourceURL="export0" */;
let vErrors = null;
let errors = 0;
const evaluated0 = validate22.evaluated;
if(evaluated0.dynamicProps){
evaluated0.props = undefined;
}
if(evaluated0.dynamicItems){
evaluated0.items = undefined;
}
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.type === undefined){
const err0 = {instancePath,schemaPath:"https://github.com/data-fair/registry/artefact-patch#/properties/privateAccess/anyOf/0/items/oneOf/0/required",keyword:"required",params:{missingProperty: "type"},message:"must have required property '"+"type"+"'",schema:schema28.required,parentSchema:schema28,data};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
if(data.id === undefined){
const err1 = {instancePath,schemaPath:"https://github.com/data-fair/registry/artefact-patch#/properties/privateAccess/anyOf/0/items/oneOf/0/required",keyword:"required",params:{missingProperty: "id"},message:"must have required property '"+"id"+"'",schema:schema28.required,parentSchema:schema28,data};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
for(const key0 in data){
if(!((key0 === "type") || (key0 === "id"))){
const err2 = {instancePath,schemaPath:"https://github.com/data-fair/registry/artefact-patch#/properties/privateAccess/anyOf/0/items/oneOf/0/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties",schema:false,parentSchema:schema28,data};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
}
if(data.type !== undefined){
let data0 = data.type;
if(typeof data0 !== "string"){
const err3 = {instancePath:instancePath+"/type",schemaPath:"https://github.com/data-fair/registry/artefact-patch#/properties/privateAccess/anyOf/0/items/oneOf/0/properties/type/type",keyword:"type",params:{type: "string"},message:"must be string",schema:schema28.properties.type.type,parentSchema:schema28.properties.type,data:data0};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
if("organization" !== data0){
const err4 = {instancePath:instancePath+"/type",schemaPath:"https://github.com/data-fair/registry/artefact-patch#/properties/privateAccess/anyOf/0/items/oneOf/0/properties/type/const",keyword:"const",params:{allowedValue: "organization"},message:"must be equal to constant",schema:"organization",parentSchema:schema28.properties.type,data:data0};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
if(errors > 0){
const emErrs0 = [];
for(const err5 of vErrors){
if(!err5.emUsed){
emErrs0.push(err5);
}
}
vErrors = emErrs0;
errors = emErrs0.length;
}
}
if(data.id !== undefined){
let data1 = data.id;
if(typeof data1 !== "string"){
const err6 = {instancePath:instancePath+"/id",schemaPath:"https://github.com/data-fair/registry/artefact-patch#/properties/privateAccess/anyOf/0/items/oneOf/0/properties/id/type",keyword:"type",params:{type: "string"},message:"must be string",schema:schema28.properties.id.type,parentSchema:schema28.properties.id,data:data1};
if(vErrors === null){
vErrors = [err6];
}
else {
vErrors.push(err6);
}
errors++;
}
if(errors > 0){
const emErrs1 = [];
for(const err7 of vErrors){
if(!err7.emUsed){
emErrs1.push(err7);
}
}
vErrors = emErrs1;
errors = emErrs1.length;
}
}
}
else {
const err8 = {instancePath,schemaPath:"https://github.com/data-fair/registry/artefact-patch#/properties/privateAccess/anyOf/0/items/oneOf/0/type",keyword:"type",params:{type: "object"},message:"must be object",schema:schema28.type,parentSchema:schema28,data};
if(vErrors === null){
vErrors = [err8];
}
else {
vErrors.push(err8);
}
errors++;
}
if(errors > 0){
const emErrors0 = {"required":{"type":[],"id":[]}};
const templates0 = {required:{}};
let emPropParams0;
let emParamsErrors0;
for(const err9 of vErrors){
if((((((err9.keyword !== "errorMessage") && (!err9.emUsed)) && (err9.instancePath === instancePath)) && (err9.keyword in emErrors0)) && (err9.schemaPath.indexOf("https://github.com/data-fair/registry/artefact-patch#/properties/privateAccess/anyOf/0/items/oneOf/0") === 0)) && (/^\/[^\/]*$/.test(err9.schemaPath.slice(100)))){
emPropParams0 = obj0[err9.keyword];
emParamsErrors0 = emErrors0[err9.keyword][err9.params[emPropParams0]];
if(emParamsErrors0){
emParamsErrors0.push(err9);
err9.emUsed = true;
}
}
}
for(const key1 in emErrors0){
for(const keyProp0 in emErrors0[key1]){
emParamsErrors0 = emErrors0[key1][keyProp0];
if(emParamsErrors0.length){
const tmpl0 = templates0[key1] && templates0[key1][keyProp0];
const err10 = {instancePath,schemaPath:"https://github.com/data-fair/registry/artefact-patch#/properties/privateAccess/anyOf/0/items/oneOf/0/errorMessage",keyword:"errorMessage",params:{errors: emParamsErrors0},message:tmpl0 ? tmpl0() : schema28.errorMessage[key1][keyProp0],schema:schema28.errorMessage,parentSchema:schema28,data};
if(vErrors === null){
vErrors = [err10];
}
else {
vErrors.push(err10);
}
errors++;
}
}
}
const emErrs2 = [];
for(const err11 of vErrors){
if(!err11.emUsed){
emErrs2.push(err11);
}
}
vErrors = emErrs2;
errors = emErrs2.length;
}
validate22.errors = vErrors;
return errors === 0;
}
validate22.evaluated = {"props":true,"dynamicProps":false,"dynamicItems":false};

const schema29 = {"$id":"export1","$ref":"https://github.com/data-fair/registry/artefact-patch#/properties/privateAccess/anyOf/0/items/oneOf/1"};
const schema30 = {"title":"Utilisateur","required":["type","id"],"additionalProperties":false,"properties":{"type":{"type":"string","const":"user","__pointer":"https://github.com/data-fair/registry/artefact-patch#/properties/privateAccess/anyOf/0/items/oneOf/1/properties/type","errorMessage":{}},"id":{"type":"string","title":"Utilisateur","layout":{"getItems":{"url":{"type":"js-tpl","expr":"/simple-directory/api/users?size=20","pure":true,"dataAlias":"value","ref":9},"qSearchParam":"q","itemsResults":{"type":"js-eval","expr":"data.results","pure":true,"dataAlias":"body","ref":8},"itemTitle":{"type":"js-eval","expr":"`${item.name} (${item.id})`","pure":true,"dataAlias":"item","ref":5},"itemValue":{"type":"js-eval","expr":"item.id","pure":true,"dataAlias":"item","ref":6},"itemIcon":{"type":"js-eval","expr":"`/simple-directory/api/avatars/user/${item.id}/avatar.png`","pure":true,"dataAlias":"item","ref":10}}},"__pointer":"https://github.com/data-fair/registry/artefact-patch#/properties/privateAccess/anyOf/0/items/oneOf/1/properties/id","errorMessage":{}}},"type":"object","__pointer":"https://github.com/data-fair/registry/artefact-patch#/properties/privateAccess/anyOf/0/items/oneOf/1","errorMessage":{"required":{"type":"information obligatoire","id":"information obligatoire"}}};

function validate24(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
/*# sourceURL="export1" */;
let vErrors = null;
let errors = 0;
const evaluated0 = validate24.evaluated;
if(evaluated0.dynamicProps){
evaluated0.props = undefined;
}
if(evaluated0.dynamicItems){
evaluated0.items = undefined;
}
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.type === undefined){
const err0 = {instancePath,schemaPath:"https://github.com/data-fair/registry/artefact-patch#/properties/privateAccess/anyOf/0/items/oneOf/1/required",keyword:"required",params:{missingProperty: "type"},message:"must have required property '"+"type"+"'",schema:schema30.required,parentSchema:schema30,data};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
if(data.id === undefined){
const err1 = {instancePath,schemaPath:"https://github.com/data-fair/registry/artefact-patch#/properties/privateAccess/anyOf/0/items/oneOf/1/required",keyword:"required",params:{missingProperty: "id"},message:"must have required property '"+"id"+"'",schema:schema30.required,parentSchema:schema30,data};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
for(const key0 in data){
if(!((key0 === "type") || (key0 === "id"))){
const err2 = {instancePath,schemaPath:"https://github.com/data-fair/registry/artefact-patch#/properties/privateAccess/anyOf/0/items/oneOf/1/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties",schema:false,parentSchema:schema30,data};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
}
if(data.type !== undefined){
let data0 = data.type;
if(typeof data0 !== "string"){
const err3 = {instancePath:instancePath+"/type",schemaPath:"https://github.com/data-fair/registry/artefact-patch#/properties/privateAccess/anyOf/0/items/oneOf/1/properties/type/type",keyword:"type",params:{type: "string"},message:"must be string",schema:schema30.properties.type.type,parentSchema:schema30.properties.type,data:data0};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
if("user" !== data0){
const err4 = {instancePath:instancePath+"/type",schemaPath:"https://github.com/data-fair/registry/artefact-patch#/properties/privateAccess/anyOf/0/items/oneOf/1/properties/type/const",keyword:"const",params:{allowedValue: "user"},message:"must be equal to constant",schema:"user",parentSchema:schema30.properties.type,data:data0};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
if(errors > 0){
const emErrs0 = [];
for(const err5 of vErrors){
if(!err5.emUsed){
emErrs0.push(err5);
}
}
vErrors = emErrs0;
errors = emErrs0.length;
}
}
if(data.id !== undefined){
let data1 = data.id;
if(typeof data1 !== "string"){
const err6 = {instancePath:instancePath+"/id",schemaPath:"https://github.com/data-fair/registry/artefact-patch#/properties/privateAccess/anyOf/0/items/oneOf/1/properties/id/type",keyword:"type",params:{type: "string"},message:"must be string",schema:schema30.properties.id.type,parentSchema:schema30.properties.id,data:data1};
if(vErrors === null){
vErrors = [err6];
}
else {
vErrors.push(err6);
}
errors++;
}
if(errors > 0){
const emErrs1 = [];
for(const err7 of vErrors){
if(!err7.emUsed){
emErrs1.push(err7);
}
}
vErrors = emErrs1;
errors = emErrs1.length;
}
}
}
else {
const err8 = {instancePath,schemaPath:"https://github.com/data-fair/registry/artefact-patch#/properties/privateAccess/anyOf/0/items/oneOf/1/type",keyword:"type",params:{type: "object"},message:"must be object",schema:schema30.type,parentSchema:schema30,data};
if(vErrors === null){
vErrors = [err8];
}
else {
vErrors.push(err8);
}
errors++;
}
if(errors > 0){
const emErrors0 = {"required":{"type":[],"id":[]}};
const templates0 = {required:{}};
let emPropParams0;
let emParamsErrors0;
for(const err9 of vErrors){
if((((((err9.keyword !== "errorMessage") && (!err9.emUsed)) && (err9.instancePath === instancePath)) && (err9.keyword in emErrors0)) && (err9.schemaPath.indexOf("https://github.com/data-fair/registry/artefact-patch#/properties/privateAccess/anyOf/0/items/oneOf/1") === 0)) && (/^\/[^\/]*$/.test(err9.schemaPath.slice(100)))){
emPropParams0 = obj0[err9.keyword];
emParamsErrors0 = emErrors0[err9.keyword][err9.params[emPropParams0]];
if(emParamsErrors0){
emParamsErrors0.push(err9);
err9.emUsed = true;
}
}
}
for(const key1 in emErrors0){
for(const keyProp0 in emErrors0[key1]){
emParamsErrors0 = emErrors0[key1][keyProp0];
if(emParamsErrors0.length){
const tmpl0 = templates0[key1] && templates0[key1][keyProp0];
const err10 = {instancePath,schemaPath:"https://github.com/data-fair/registry/artefact-patch#/properties/privateAccess/anyOf/0/items/oneOf/1/errorMessage",keyword:"errorMessage",params:{errors: emParamsErrors0},message:tmpl0 ? tmpl0() : schema30.errorMessage[key1][keyProp0],schema:schema30.errorMessage,parentSchema:schema30,data};
if(vErrors === null){
vErrors = [err10];
}
else {
vErrors.push(err10);
}
errors++;
}
}
}
const emErrs2 = [];
for(const err11 of vErrors){
if(!err11.emUsed){
emErrs2.push(err11);
}
}
vErrors = emErrs2;
errors = emErrs2.length;
}
validate24.errors = vErrors;
return errors === 0;
}
validate24.evaluated = {"props":true,"dynamicProps":false,"dynamicItems":false};

const schema31 = {"$id":"export2","$ref":"https://github.com/data-fair/registry/artefact-patch#/properties/privateAccess/anyOf/0/items"};
const schema32 = {"type":"object","discriminator":{"propertyName":"type"},"oneOfLayout":{"emptyData":true},"oneOf":[{"title":"Organisation","required":["type","id"],"additionalProperties":false,"properties":{"type":{"type":"string","const":"organization","__pointer":"https://github.com/data-fair/registry/artefact-patch#/properties/privateAccess/anyOf/0/items/oneOf/0/properties/type","errorMessage":{}},"id":{"type":"string","title":"Organisation","layout":{"getItems":{"url":{"type":"js-tpl","expr":"/simple-directory/api/organizations?size=20","pure":true,"dataAlias":"value","ref":4},"qSearchParam":"q","itemsResults":{"type":"js-eval","expr":"data.results","pure":true,"dataAlias":"body","ref":8},"itemTitle":{"type":"js-eval","expr":"`${item.name} (${item.id})`","pure":true,"dataAlias":"item","ref":5},"itemValue":{"type":"js-eval","expr":"item.id","pure":true,"dataAlias":"item","ref":6},"itemIcon":{"type":"js-eval","expr":"`/simple-directory/api/avatars/organization/${item.id}/avatar.png`","pure":true,"dataAlias":"item","ref":7}}},"__pointer":"https://github.com/data-fair/registry/artefact-patch#/properties/privateAccess/anyOf/0/items/oneOf/0/properties/id","errorMessage":{}}},"type":"object","__pointer":"https://github.com/data-fair/registry/artefact-patch#/properties/privateAccess/anyOf/0/items/oneOf/0","errorMessage":{"required":{"type":"information obligatoire","id":"information obligatoire"}}},{"title":"Utilisateur","required":["type","id"],"additionalProperties":false,"properties":{"type":{"type":"string","const":"user","__pointer":"https://github.com/data-fair/registry/artefact-patch#/properties/privateAccess/anyOf/0/items/oneOf/1/properties/type","errorMessage":{}},"id":{"type":"string","title":"Utilisateur","layout":{"getItems":{"url":{"type":"js-tpl","expr":"/simple-directory/api/users?size=20","pure":true,"dataAlias":"value","ref":9},"qSearchParam":"q","itemsResults":{"type":"js-eval","expr":"data.results","pure":true,"dataAlias":"body","ref":8},"itemTitle":{"type":"js-eval","expr":"`${item.name} (${item.id})`","pure":true,"dataAlias":"item","ref":5},"itemValue":{"type":"js-eval","expr":"item.id","pure":true,"dataAlias":"item","ref":6},"itemIcon":{"type":"js-eval","expr":"`/simple-directory/api/avatars/user/${item.id}/avatar.png`","pure":true,"dataAlias":"item","ref":10}}},"__pointer":"https://github.com/data-fair/registry/artefact-patch#/properties/privateAccess/anyOf/0/items/oneOf/1/properties/id","errorMessage":{}}},"type":"object","__pointer":"https://github.com/data-fair/registry/artefact-patch#/properties/privateAccess/anyOf/0/items/oneOf/1","errorMessage":{"required":{"type":"information obligatoire","id":"information obligatoire"}}}],"__pointer":"https://github.com/data-fair/registry/artefact-patch#/properties/privateAccess/anyOf/0/items","errorMessage":{"oneOf":"choisissez une valeur"}};

function validate25(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
/*# sourceURL="export2" */;
let vErrors = null;
let errors = 0;
const evaluated0 = validate25.evaluated;
if(evaluated0.dynamicProps){
evaluated0.props = undefined;
}
if(evaluated0.dynamicItems){
evaluated0.items = undefined;
}
if(!(data && typeof data == "object" && !Array.isArray(data))){
const err0 = {instancePath,schemaPath:"https://github.com/data-fair/registry/artefact-patch#/properties/privateAccess/anyOf/0/items/type",keyword:"type",params:{type: "object"},message:"must be object",schema:schema32.type,parentSchema:schema32,data};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
const _errs2 = errors;
let valid1 = false;
let passing0 = null;
const _errs3 = errors;
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.type === undefined){
const err1 = {instancePath,schemaPath:"https://github.com/data-fair/registry/artefact-patch#/properties/privateAccess/anyOf/0/items/oneOf/0/required",keyword:"required",params:{missingProperty: "type"},message:"must have required property '"+"type"+"'",schema:schema32.oneOf[0].required,parentSchema:schema32.oneOf[0],data};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
if(data.id === undefined){
const err2 = {instancePath,schemaPath:"https://github.com/data-fair/registry/artefact-patch#/properties/privateAccess/anyOf/0/items/oneOf/0/required",keyword:"required",params:{missingProperty: "id"},message:"must have required property '"+"id"+"'",schema:schema32.oneOf[0].required,parentSchema:schema32.oneOf[0],data};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
for(const key0 in data){
if(!((key0 === "type") || (key0 === "id"))){
const err3 = {instancePath,schemaPath:"https://github.com/data-fair/registry/artefact-patch#/properties/privateAccess/anyOf/0/items/oneOf/0/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties",schema:false,parentSchema:schema32.oneOf[0],data};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
}
if(data.type !== undefined){
let data0 = data.type;
if(typeof data0 !== "string"){
const err4 = {instancePath:instancePath+"/type",schemaPath:"https://github.com/data-fair/registry/artefact-patch#/properties/privateAccess/anyOf/0/items/oneOf/0/properties/type/type",keyword:"type",params:{type: "string"},message:"must be string",schema:schema32.oneOf[0].properties.type.type,parentSchema:schema32.oneOf[0].properties.type,data:data0};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
if("organization" !== data0){
const err5 = {instancePath:instancePath+"/type",schemaPath:"https://github.com/data-fair/registry/artefact-patch#/properties/privateAccess/anyOf/0/items/oneOf/0/properties/type/const",keyword:"const",params:{allowedValue: "organization"},message:"must be equal to constant",schema:"organization",parentSchema:schema32.oneOf[0].properties.type,data:data0};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
if(errors > 0){
const emErrs0 = [];
for(const err6 of vErrors){
if(!err6.emUsed){
emErrs0.push(err6);
}
}
vErrors = emErrs0;
errors = emErrs0.length;
}
}
if(data.id !== undefined){
let data1 = data.id;
if(typeof data1 !== "string"){
const err7 = {instancePath:instancePath+"/id",schemaPath:"https://github.com/data-fair/registry/artefact-patch#/properties/privateAccess/anyOf/0/items/oneOf/0/properties/id/type",keyword:"type",params:{type: "string"},message:"must be string",schema:schema32.oneOf[0].properties.id.type,parentSchema:schema32.oneOf[0].properties.id,data:data1};
if(vErrors === null){
vErrors = [err7];
}
else {
vErrors.push(err7);
}
errors++;
}
if(errors > 0){
const emErrs1 = [];
for(const err8 of vErrors){
if(!err8.emUsed){
emErrs1.push(err8);
}
}
vErrors = emErrs1;
errors = emErrs1.length;
}
}
}
else {
const err9 = {instancePath,schemaPath:"https://github.com/data-fair/registry/artefact-patch#/properties/privateAccess/anyOf/0/items/oneOf/0/type",keyword:"type",params:{type: "object"},message:"must be object",schema:schema32.oneOf[0].type,parentSchema:schema32.oneOf[0],data};
if(vErrors === null){
vErrors = [err9];
}
else {
vErrors.push(err9);
}
errors++;
}
if(errors > 0){
const emErrors0 = {"required":{"type":[],"id":[]}};
const templates0 = {required:{}};
let emPropParams0;
let emParamsErrors0;
for(const err10 of vErrors){
if((((((err10.keyword !== "errorMessage") && (!err10.emUsed)) && (err10.instancePath === instancePath)) && (err10.keyword in emErrors0)) && (err10.schemaPath.indexOf("https://github.com/data-fair/registry/artefact-patch#/properties/privateAccess/anyOf/0/items/oneOf/0") === 0)) && (/^\/[^\/]*$/.test(err10.schemaPath.slice(100)))){
emPropParams0 = obj0[err10.keyword];
emParamsErrors0 = emErrors0[err10.keyword][err10.params[emPropParams0]];
if(emParamsErrors0){
emParamsErrors0.push(err10);
err10.emUsed = true;
}
}
}
for(const key1 in emErrors0){
for(const keyProp0 in emErrors0[key1]){
emParamsErrors0 = emErrors0[key1][keyProp0];
if(emParamsErrors0.length){
const tmpl0 = templates0[key1] && templates0[key1][keyProp0];
const err11 = {instancePath,schemaPath:"https://github.com/data-fair/registry/artefact-patch#/properties/privateAccess/anyOf/0/items/oneOf/0/errorMessage",keyword:"errorMessage",params:{errors: emParamsErrors0},message:tmpl0 ? tmpl0() : schema32.oneOf[0].errorMessage[key1][keyProp0],schema:schema32.oneOf[0].errorMessage,parentSchema:schema32.oneOf[0],data};
if(vErrors === null){
vErrors = [err11];
}
else {
vErrors.push(err11);
}
errors++;
}
}
}
const emErrs2 = [];
for(const err12 of vErrors){
if(!err12.emUsed){
emErrs2.push(err12);
}
}
vErrors = emErrs2;
errors = emErrs2.length;
}
var _valid0 = _errs3 === errors;
if(_valid0){
valid1 = true;
passing0 = 0;
var props0 = true;
}
const _errs10 = errors;
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.type === undefined){
const err13 = {instancePath,schemaPath:"https://github.com/data-fair/registry/artefact-patch#/properties/privateAccess/anyOf/0/items/oneOf/1/required",keyword:"required",params:{missingProperty: "type"},message:"must have required property '"+"type"+"'",schema:schema32.oneOf[1].required,parentSchema:schema32.oneOf[1],data};
if(vErrors === null){
vErrors = [err13];
}
else {
vErrors.push(err13);
}
errors++;
}
if(data.id === undefined){
const err14 = {instancePath,schemaPath:"https://github.com/data-fair/registry/artefact-patch#/properties/privateAccess/anyOf/0/items/oneOf/1/required",keyword:"required",params:{missingProperty: "id"},message:"must have required property '"+"id"+"'",schema:schema32.oneOf[1].required,parentSchema:schema32.oneOf[1],data};
if(vErrors === null){
vErrors = [err14];
}
else {
vErrors.push(err14);
}
errors++;
}
for(const key2 in data){
if(!((key2 === "type") || (key2 === "id"))){
const err15 = {instancePath,schemaPath:"https://github.com/data-fair/registry/artefact-patch#/properties/privateAccess/anyOf/0/items/oneOf/1/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key2},message:"must NOT have additional properties",schema:false,parentSchema:schema32.oneOf[1],data};
if(vErrors === null){
vErrors = [err15];
}
else {
vErrors.push(err15);
}
errors++;
}
}
if(data.type !== undefined){
let data2 = data.type;
if(typeof data2 !== "string"){
const err16 = {instancePath:instancePath+"/type",schemaPath:"https://github.com/data-fair/registry/artefact-patch#/properties/privateAccess/anyOf/0/items/oneOf/1/properties/type/type",keyword:"type",params:{type: "string"},message:"must be string",schema:schema32.oneOf[1].properties.type.type,parentSchema:schema32.oneOf[1].properties.type,data:data2};
if(vErrors === null){
vErrors = [err16];
}
else {
vErrors.push(err16);
}
errors++;
}
if("user" !== data2){
const err17 = {instancePath:instancePath+"/type",schemaPath:"https://github.com/data-fair/registry/artefact-patch#/properties/privateAccess/anyOf/0/items/oneOf/1/properties/type/const",keyword:"const",params:{allowedValue: "user"},message:"must be equal to constant",schema:"user",parentSchema:schema32.oneOf[1].properties.type,data:data2};
if(vErrors === null){
vErrors = [err17];
}
else {
vErrors.push(err17);
}
errors++;
}
if(errors > 0){
const emErrs3 = [];
for(const err18 of vErrors){
if(!err18.emUsed){
emErrs3.push(err18);
}
}
vErrors = emErrs3;
errors = emErrs3.length;
}
}
if(data.id !== undefined){
let data3 = data.id;
if(typeof data3 !== "string"){
const err19 = {instancePath:instancePath+"/id",schemaPath:"https://github.com/data-fair/registry/artefact-patch#/properties/privateAccess/anyOf/0/items/oneOf/1/properties/id/type",keyword:"type",params:{type: "string"},message:"must be string",schema:schema32.oneOf[1].properties.id.type,parentSchema:schema32.oneOf[1].properties.id,data:data3};
if(vErrors === null){
vErrors = [err19];
}
else {
vErrors.push(err19);
}
errors++;
}
if(errors > 0){
const emErrs4 = [];
for(const err20 of vErrors){
if(!err20.emUsed){
emErrs4.push(err20);
}
}
vErrors = emErrs4;
errors = emErrs4.length;
}
}
}
else {
const err21 = {instancePath,schemaPath:"https://github.com/data-fair/registry/artefact-patch#/properties/privateAccess/anyOf/0/items/oneOf/1/type",keyword:"type",params:{type: "object"},message:"must be object",schema:schema32.oneOf[1].type,parentSchema:schema32.oneOf[1],data};
if(vErrors === null){
vErrors = [err21];
}
else {
vErrors.push(err21);
}
errors++;
}
if(errors > 0){
const emErrors1 = {"required":{"type":[],"id":[]}};
const templates1 = {required:{}};
let emPropParams1;
let emParamsErrors1;
for(const err22 of vErrors){
if((((((err22.keyword !== "errorMessage") && (!err22.emUsed)) && (err22.instancePath === instancePath)) && (err22.keyword in emErrors1)) && (err22.schemaPath.indexOf("https://github.com/data-fair/registry/artefact-patch#/properties/privateAccess/anyOf/0/items/oneOf/1") === 0)) && (/^\/[^\/]*$/.test(err22.schemaPath.slice(100)))){
emPropParams1 = obj0[err22.keyword];
emParamsErrors1 = emErrors1[err22.keyword][err22.params[emPropParams1]];
if(emParamsErrors1){
emParamsErrors1.push(err22);
err22.emUsed = true;
}
}
}
for(const key3 in emErrors1){
for(const keyProp1 in emErrors1[key3]){
emParamsErrors1 = emErrors1[key3][keyProp1];
if(emParamsErrors1.length){
const tmpl1 = templates1[key3] && templates1[key3][keyProp1];
const err23 = {instancePath,schemaPath:"https://github.com/data-fair/registry/artefact-patch#/properties/privateAccess/anyOf/0/items/oneOf/1/errorMessage",keyword:"errorMessage",params:{errors: emParamsErrors1},message:tmpl1 ? tmpl1() : schema32.oneOf[1].errorMessage[key3][keyProp1],schema:schema32.oneOf[1].errorMessage,parentSchema:schema32.oneOf[1],data};
if(vErrors === null){
vErrors = [err23];
}
else {
vErrors.push(err23);
}
errors++;
}
}
}
const emErrs5 = [];
for(const err24 of vErrors){
if(!err24.emUsed){
emErrs5.push(err24);
}
}
vErrors = emErrs5;
errors = emErrs5.length;
}
var _valid0 = _errs10 === errors;
if(_valid0 && valid1){
valid1 = false;
passing0 = [passing0, 1];
}
else {
if(_valid0){
valid1 = true;
passing0 = 1;
if(props0 !== true){
props0 = true;
}
}
}
if(!valid1){
const err25 = {instancePath,schemaPath:"https://github.com/data-fair/registry/artefact-patch#/properties/privateAccess/anyOf/0/items/oneOf",keyword:"oneOf",params:{passingSchemas: passing0},message:"must match exactly one schema in oneOf",schema:schema32.oneOf,parentSchema:schema32,data};
if(vErrors === null){
vErrors = [err25];
}
else {
vErrors.push(err25);
}
errors++;
}
else {
errors = _errs2;
if(vErrors !== null){
if(_errs2){
vErrors.length = _errs2;
}
else {
vErrors = null;
}
}
}
if(errors > 0){
const emErrors2 = {"oneOf":[]};
const templates2 = {};
for(const err26 of vErrors){
if((((((err26.keyword !== "errorMessage") && (!err26.emUsed)) && (err26.instancePath === instancePath)) && (err26.keyword in emErrors2)) && (err26.schemaPath.indexOf("https://github.com/data-fair/registry/artefact-patch#/properties/privateAccess/anyOf/0/items") === 0)) && (/^\/[^\/]*$/.test(err26.schemaPath.slice(92)))){
emErrors2[err26.keyword].push(err26);
err26.emUsed = true;
}
}
for(const key4 in emErrors2){
if(emErrors2[key4].length){
const err27 = {instancePath,schemaPath:"https://github.com/data-fair/registry/artefact-patch#/properties/privateAccess/anyOf/0/items/errorMessage",keyword:"errorMessage",params:{errors: emErrors2[key4]},message:key4 in templates2 ? templates2[key4]() : schema32.errorMessage[key4],schema:schema32.errorMessage,parentSchema:schema32,data};
if(vErrors === null){
vErrors = [err27];
}
else {
vErrors.push(err27);
}
errors++;
}
}
const emErrs6 = [];
for(const err28 of vErrors){
if(!err28.emUsed){
emErrs6.push(err28);
}
}
vErrors = emErrs6;
errors = emErrs6.length;
}
validate25.errors = vErrors;
evaluated0.props = props0;
return errors === 0;
}
validate25.evaluated = {"dynamicProps":true,"dynamicItems":false};

const schema33 = {"$id":"export3","$ref":"https://github.com/data-fair/registry/artefact-patch#"};
const schema27 = {"$id":"https://github.com/data-fair/registry/artefact-patch","x-exports":["validate","types","vjsf"],"x-vjsf":{"xI18n":true},"x-vjsf-locales":["en","fr"],"title":"Artefact patch","type":"object","additionalProperties":false,"layout":{"title":null},"properties":{"title":{"anyOf":[{"type":"object","additionalProperties":false,"properties":{"en":{"type":"string","title":"Titre - Anglais","layout":{"cols":{"md":6}},"__pointer":"https://github.com/data-fair/registry/artefact-patch#/properties/title/anyOf/0/properties/en","errorMessage":{}},"fr":{"type":"string","title":"Titre - Français","layout":{"cols":{"md":6}},"__pointer":"https://github.com/data-fair/registry/artefact-patch#/properties/title/anyOf/0/properties/fr","errorMessage":{}}}},{"type":"null"}],"__pointer":"https://github.com/data-fair/registry/artefact-patch#/properties/title","errorMessage":{}},"description":{"anyOf":[{"type":"object","additionalProperties":false,"properties":{"en":{"type":"string","title":"Description - Anglais","layout":{"comp":"textarea","props":{"autoGrow":true,"rows":3},"cols":{"md":6}},"__pointer":"https://github.com/data-fair/registry/artefact-patch#/properties/description/anyOf/0/properties/en","errorMessage":{}},"fr":{"type":"string","title":"Description - Français","layout":{"comp":"textarea","props":{"autoGrow":true,"rows":3},"cols":{"md":6}},"__pointer":"https://github.com/data-fair/registry/artefact-patch#/properties/description/anyOf/0/properties/fr","errorMessage":{}}}},{"type":"null"}],"__pointer":"https://github.com/data-fair/registry/artefact-patch#/properties/description","errorMessage":{}},"public":{"anyOf":[{"type":"boolean","title":"Public","layout":"switch","default":false},{"type":"null"}],"__pointer":"https://github.com/data-fair/registry/artefact-patch#/properties/public","errorMessage":{}},"privateAccess":{"anyOf":[{"type":"array","title":"Accès privés","layout":{"if":"!parent.data?.public"},"items":{"type":"object","discriminator":{"propertyName":"type"},"oneOfLayout":{"emptyData":true},"oneOf":[{"title":"Organisation","required":["type","id"],"additionalProperties":false,"properties":{"type":{"type":"string","const":"organization","__pointer":"https://github.com/data-fair/registry/artefact-patch#/properties/privateAccess/anyOf/0/items/oneOf/0/properties/type","errorMessage":{}},"id":{"type":"string","title":"Organisation","layout":{"getItems":{"url":{"type":"js-tpl","expr":"/simple-directory/api/organizations?size=20","pure":true,"dataAlias":"value","ref":4},"qSearchParam":"q","itemsResults":{"type":"js-eval","expr":"data.results","pure":true,"dataAlias":"body","ref":8},"itemTitle":{"type":"js-eval","expr":"`${item.name} (${item.id})`","pure":true,"dataAlias":"item","ref":5},"itemValue":{"type":"js-eval","expr":"item.id","pure":true,"dataAlias":"item","ref":6},"itemIcon":{"type":"js-eval","expr":"`/simple-directory/api/avatars/organization/${item.id}/avatar.png`","pure":true,"dataAlias":"item","ref":7}}},"__pointer":"https://github.com/data-fair/registry/artefact-patch#/properties/privateAccess/anyOf/0/items/oneOf/0/properties/id","errorMessage":{}}},"type":"object","__pointer":"https://github.com/data-fair/registry/artefact-patch#/properties/privateAccess/anyOf/0/items/oneOf/0","errorMessage":{"required":{"type":"information obligatoire","id":"information obligatoire"}}},{"title":"Utilisateur","required":["type","id"],"additionalProperties":false,"properties":{"type":{"type":"string","const":"user","__pointer":"https://github.com/data-fair/registry/artefact-patch#/properties/privateAccess/anyOf/0/items/oneOf/1/properties/type","errorMessage":{}},"id":{"type":"string","title":"Utilisateur","layout":{"getItems":{"url":{"type":"js-tpl","expr":"/simple-directory/api/users?size=20","pure":true,"dataAlias":"value","ref":9},"qSearchParam":"q","itemsResults":{"type":"js-eval","expr":"data.results","pure":true,"dataAlias":"body","ref":8},"itemTitle":{"type":"js-eval","expr":"`${item.name} (${item.id})`","pure":true,"dataAlias":"item","ref":5},"itemValue":{"type":"js-eval","expr":"item.id","pure":true,"dataAlias":"item","ref":6},"itemIcon":{"type":"js-eval","expr":"`/simple-directory/api/avatars/user/${item.id}/avatar.png`","pure":true,"dataAlias":"item","ref":10}}},"__pointer":"https://github.com/data-fair/registry/artefact-patch#/properties/privateAccess/anyOf/0/items/oneOf/1/properties/id","errorMessage":{}}},"type":"object","__pointer":"https://github.com/data-fair/registry/artefact-patch#/properties/privateAccess/anyOf/0/items/oneOf/1","errorMessage":{"required":{"type":"information obligatoire","id":"information obligatoire"}}}],"__pointer":"https://github.com/data-fair/registry/artefact-patch#/properties/privateAccess/anyOf/0/items","errorMessage":{"oneOf":"choisissez une valeur"}}},{"type":"null"}],"__pointer":"https://github.com/data-fair/registry/artefact-patch#/properties/privateAccess","errorMessage":{}},"processingConfigSchema":{"anyOf":[{"type":"object","layout":{"comp":"none"}},{"type":"null"}],"__pointer":"https://github.com/data-fair/registry/artefact-patch#/properties/processingConfigSchema","errorMessage":{}},"applicationConfigSchema":{"anyOf":[{"type":"object","layout":{"comp":"none"}},{"type":"null"}],"__pointer":"https://github.com/data-fair/registry/artefact-patch#/properties/applicationConfigSchema","errorMessage":{}}},"__pointer":"https://github.com/data-fair/registry/artefact-patch#","errorMessage":{}};

function validate26(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
/*# sourceURL="export3" */;
let vErrors = null;
let errors = 0;
const evaluated0 = validate26.evaluated;
if(evaluated0.dynamicProps){
evaluated0.props = undefined;
}
if(evaluated0.dynamicItems){
evaluated0.items = undefined;
}
if(data && typeof data == "object" && !Array.isArray(data)){
for(const key0 in data){
if(!((((((key0 === "title") || (key0 === "description")) || (key0 === "public")) || (key0 === "privateAccess")) || (key0 === "processingConfigSchema")) || (key0 === "applicationConfigSchema"))){
const err0 = {instancePath,schemaPath:"https://github.com/data-fair/registry/artefact-patch#/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties",schema:false,parentSchema:schema27,data};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
}
if(data.title !== undefined){
let data0 = data.title;
const _errs4 = errors;
let valid2 = false;
const _errs5 = errors;
if(data0 && typeof data0 == "object" && !Array.isArray(data0)){
for(const key1 in data0){
if(!((key1 === "en") || (key1 === "fr"))){
const err1 = {instancePath:instancePath+"/title",schemaPath:"https://github.com/data-fair/registry/artefact-patch#/properties/title/anyOf/0/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key1},message:"must NOT have additional properties",schema:false,parentSchema:schema27.properties.title.anyOf[0],data:data0};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
}
if(data0.en !== undefined){
let data1 = data0.en;
if(typeof data1 !== "string"){
const err2 = {instancePath:instancePath+"/title/en",schemaPath:"https://github.com/data-fair/registry/artefact-patch#/properties/title/anyOf/0/properties/en/type",keyword:"type",params:{type: "string"},message:"must be string",schema:schema27.properties.title.anyOf[0].properties.en.type,parentSchema:schema27.properties.title.anyOf[0].properties.en,data:data1};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
if(errors > 0){
const emErrs0 = [];
for(const err3 of vErrors){
if(!err3.emUsed){
emErrs0.push(err3);
}
}
vErrors = emErrs0;
errors = emErrs0.length;
}
}
if(data0.fr !== undefined){
let data2 = data0.fr;
if(typeof data2 !== "string"){
const err4 = {instancePath:instancePath+"/title/fr",schemaPath:"https://github.com/data-fair/registry/artefact-patch#/properties/title/anyOf/0/properties/fr/type",keyword:"type",params:{type: "string"},message:"must be string",schema:schema27.properties.title.anyOf[0].properties.fr.type,parentSchema:schema27.properties.title.anyOf[0].properties.fr,data:data2};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
if(errors > 0){
const emErrs1 = [];
for(const err5 of vErrors){
if(!err5.emUsed){
emErrs1.push(err5);
}
}
vErrors = emErrs1;
errors = emErrs1.length;
}
}
}
else {
const err6 = {instancePath:instancePath+"/title",schemaPath:"https://github.com/data-fair/registry/artefact-patch#/properties/title/anyOf/0/type",keyword:"type",params:{type: "object"},message:"must be object",schema:schema27.properties.title.anyOf[0].type,parentSchema:schema27.properties.title.anyOf[0],data:data0};
if(vErrors === null){
vErrors = [err6];
}
else {
vErrors.push(err6);
}
errors++;
}
var _valid0 = _errs5 === errors;
valid2 = valid2 || _valid0;
const _errs12 = errors;
if(data0 !== null){
const err7 = {instancePath:instancePath+"/title",schemaPath:"https://github.com/data-fair/registry/artefact-patch#/properties/title/anyOf/1/type",keyword:"type",params:{type: "null"},message:"must be null",schema:schema27.properties.title.anyOf[1].type,parentSchema:schema27.properties.title.anyOf[1],data:data0};
if(vErrors === null){
vErrors = [err7];
}
else {
vErrors.push(err7);
}
errors++;
}
var _valid0 = _errs12 === errors;
valid2 = valid2 || _valid0;
if(!valid2){
const err8 = {instancePath:instancePath+"/title",schemaPath:"https://github.com/data-fair/registry/artefact-patch#/properties/title/anyOf",keyword:"anyOf",params:{},message:"must match a schema in anyOf",schema:schema27.properties.title.anyOf,parentSchema:schema27.properties.title,data:data0};
if(vErrors === null){
vErrors = [err8];
}
else {
vErrors.push(err8);
}
errors++;
}
else {
errors = _errs4;
if(vErrors !== null){
if(_errs4){
vErrors.length = _errs4;
}
else {
vErrors = null;
}
}
}
if(errors > 0){
const emErrs2 = [];
for(const err9 of vErrors){
if(!err9.emUsed){
emErrs2.push(err9);
}
}
vErrors = emErrs2;
errors = emErrs2.length;
}
}
if(data.description !== undefined){
let data3 = data.description;
const _errs15 = errors;
let valid4 = false;
const _errs16 = errors;
if(data3 && typeof data3 == "object" && !Array.isArray(data3)){
for(const key2 in data3){
if(!((key2 === "en") || (key2 === "fr"))){
const err10 = {instancePath:instancePath+"/description",schemaPath:"https://github.com/data-fair/registry/artefact-patch#/properties/description/anyOf/0/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key2},message:"must NOT have additional properties",schema:false,parentSchema:schema27.properties.description.anyOf[0],data:data3};
if(vErrors === null){
vErrors = [err10];
}
else {
vErrors.push(err10);
}
errors++;
}
}
if(data3.en !== undefined){
let data4 = data3.en;
if(typeof data4 !== "string"){
const err11 = {instancePath:instancePath+"/description/en",schemaPath:"https://github.com/data-fair/registry/artefact-patch#/properties/description/anyOf/0/properties/en/type",keyword:"type",params:{type: "string"},message:"must be string",schema:schema27.properties.description.anyOf[0].properties.en.type,parentSchema:schema27.properties.description.anyOf[0].properties.en,data:data4};
if(vErrors === null){
vErrors = [err11];
}
else {
vErrors.push(err11);
}
errors++;
}
if(errors > 0){
const emErrs3 = [];
for(const err12 of vErrors){
if(!err12.emUsed){
emErrs3.push(err12);
}
}
vErrors = emErrs3;
errors = emErrs3.length;
}
}
if(data3.fr !== undefined){
let data5 = data3.fr;
if(typeof data5 !== "string"){
const err13 = {instancePath:instancePath+"/description/fr",schemaPath:"https://github.com/data-fair/registry/artefact-patch#/properties/description/anyOf/0/properties/fr/type",keyword:"type",params:{type: "string"},message:"must be string",schema:schema27.properties.description.anyOf[0].properties.fr.type,parentSchema:schema27.properties.description.anyOf[0].properties.fr,data:data5};
if(vErrors === null){
vErrors = [err13];
}
else {
vErrors.push(err13);
}
errors++;
}
if(errors > 0){
const emErrs4 = [];
for(const err14 of vErrors){
if(!err14.emUsed){
emErrs4.push(err14);
}
}
vErrors = emErrs4;
errors = emErrs4.length;
}
}
}
else {
const err15 = {instancePath:instancePath+"/description",schemaPath:"https://github.com/data-fair/registry/artefact-patch#/properties/description/anyOf/0/type",keyword:"type",params:{type: "object"},message:"must be object",schema:schema27.properties.description.anyOf[0].type,parentSchema:schema27.properties.description.anyOf[0],data:data3};
if(vErrors === null){
vErrors = [err15];
}
else {
vErrors.push(err15);
}
errors++;
}
var _valid1 = _errs16 === errors;
valid4 = valid4 || _valid1;
const _errs23 = errors;
if(data3 !== null){
const err16 = {instancePath:instancePath+"/description",schemaPath:"https://github.com/data-fair/registry/artefact-patch#/properties/description/anyOf/1/type",keyword:"type",params:{type: "null"},message:"must be null",schema:schema27.properties.description.anyOf[1].type,parentSchema:schema27.properties.description.anyOf[1],data:data3};
if(vErrors === null){
vErrors = [err16];
}
else {
vErrors.push(err16);
}
errors++;
}
var _valid1 = _errs23 === errors;
valid4 = valid4 || _valid1;
if(!valid4){
const err17 = {instancePath:instancePath+"/description",schemaPath:"https://github.com/data-fair/registry/artefact-patch#/properties/description/anyOf",keyword:"anyOf",params:{},message:"must match a schema in anyOf",schema:schema27.properties.description.anyOf,parentSchema:schema27.properties.description,data:data3};
if(vErrors === null){
vErrors = [err17];
}
else {
vErrors.push(err17);
}
errors++;
}
else {
errors = _errs15;
if(vErrors !== null){
if(_errs15){
vErrors.length = _errs15;
}
else {
vErrors = null;
}
}
}
if(errors > 0){
const emErrs5 = [];
for(const err18 of vErrors){
if(!err18.emUsed){
emErrs5.push(err18);
}
}
vErrors = emErrs5;
errors = emErrs5.length;
}
}
if(data.public !== undefined){
let data6 = data.public;
const _errs26 = errors;
let valid6 = false;
const _errs27 = errors;
if(typeof data6 !== "boolean"){
const err19 = {instancePath:instancePath+"/public",schemaPath:"https://github.com/data-fair/registry/artefact-patch#/properties/public/anyOf/0/type",keyword:"type",params:{type: "boolean"},message:"must be boolean",schema:schema27.properties.public.anyOf[0].type,parentSchema:schema27.properties.public.anyOf[0],data:data6};
if(vErrors === null){
vErrors = [err19];
}
else {
vErrors.push(err19);
}
errors++;
}
var _valid2 = _errs27 === errors;
valid6 = valid6 || _valid2;
const _errs29 = errors;
if(data6 !== null){
const err20 = {instancePath:instancePath+"/public",schemaPath:"https://github.com/data-fair/registry/artefact-patch#/properties/public/anyOf/1/type",keyword:"type",params:{type: "null"},message:"must be null",schema:schema27.properties.public.anyOf[1].type,parentSchema:schema27.properties.public.anyOf[1],data:data6};
if(vErrors === null){
vErrors = [err20];
}
else {
vErrors.push(err20);
}
errors++;
}
var _valid2 = _errs29 === errors;
valid6 = valid6 || _valid2;
if(!valid6){
const err21 = {instancePath:instancePath+"/public",schemaPath:"https://github.com/data-fair/registry/artefact-patch#/properties/public/anyOf",keyword:"anyOf",params:{},message:"must match a schema in anyOf",schema:schema27.properties.public.anyOf,parentSchema:schema27.properties.public,data:data6};
if(vErrors === null){
vErrors = [err21];
}
else {
vErrors.push(err21);
}
errors++;
}
else {
errors = _errs26;
if(vErrors !== null){
if(_errs26){
vErrors.length = _errs26;
}
else {
vErrors = null;
}
}
}
if(errors > 0){
const emErrs6 = [];
for(const err22 of vErrors){
if(!err22.emUsed){
emErrs6.push(err22);
}
}
vErrors = emErrs6;
errors = emErrs6.length;
}
}
if(data.privateAccess !== undefined){
let data7 = data.privateAccess;
const _errs32 = errors;
let valid7 = false;
const _errs33 = errors;
if(Array.isArray(data7)){
const len0 = data7.length;
for(let i0=0; i0<len0; i0++){
let data8 = data7[i0];
if(!(data8 && typeof data8 == "object" && !Array.isArray(data8))){
const err23 = {instancePath:instancePath+"/privateAccess/" + i0,schemaPath:"https://github.com/data-fair/registry/artefact-patch#/properties/privateAccess/anyOf/0/items/type",keyword:"type",params:{type: "object"},message:"must be object",schema:schema27.properties.privateAccess.anyOf[0].items.type,parentSchema:schema27.properties.privateAccess.anyOf[0].items,data:data8};
if(vErrors === null){
vErrors = [err23];
}
else {
vErrors.push(err23);
}
errors++;
}
const _errs37 = errors;
let valid10 = false;
let passing0 = null;
const _errs38 = errors;
if(data8 && typeof data8 == "object" && !Array.isArray(data8)){
if(data8.type === undefined){
const err24 = {instancePath:instancePath+"/privateAccess/" + i0,schemaPath:"https://github.com/data-fair/registry/artefact-patch#/properties/privateAccess/anyOf/0/items/oneOf/0/required",keyword:"required",params:{missingProperty: "type"},message:"must have required property '"+"type"+"'",schema:schema27.properties.privateAccess.anyOf[0].items.oneOf[0].required,parentSchema:schema27.properties.privateAccess.anyOf[0].items.oneOf[0],data:data8};
if(vErrors === null){
vErrors = [err24];
}
else {
vErrors.push(err24);
}
errors++;
}
if(data8.id === undefined){
const err25 = {instancePath:instancePath+"/privateAccess/" + i0,schemaPath:"https://github.com/data-fair/registry/artefact-patch#/properties/privateAccess/anyOf/0/items/oneOf/0/required",keyword:"required",params:{missingProperty: "id"},message:"must have required property '"+"id"+"'",schema:schema27.properties.privateAccess.anyOf[0].items.oneOf[0].required,parentSchema:schema27.properties.privateAccess.anyOf[0].items.oneOf[0],data:data8};
if(vErrors === null){
vErrors = [err25];
}
else {
vErrors.push(err25);
}
errors++;
}
for(const key3 in data8){
if(!((key3 === "type") || (key3 === "id"))){
const err26 = {instancePath:instancePath+"/privateAccess/" + i0,schemaPath:"https://github.com/data-fair/registry/artefact-patch#/properties/privateAccess/anyOf/0/items/oneOf/0/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key3},message:"must NOT have additional properties",schema:false,parentSchema:schema27.properties.privateAccess.anyOf[0].items.oneOf[0],data:data8};
if(vErrors === null){
vErrors = [err26];
}
else {
vErrors.push(err26);
}
errors++;
}
}
if(data8.type !== undefined){
let data9 = data8.type;
if(typeof data9 !== "string"){
const err27 = {instancePath:instancePath+"/privateAccess/" + i0+"/type",schemaPath:"https://github.com/data-fair/registry/artefact-patch#/properties/privateAccess/anyOf/0/items/oneOf/0/properties/type/type",keyword:"type",params:{type: "string"},message:"must be string",schema:schema27.properties.privateAccess.anyOf[0].items.oneOf[0].properties.type.type,parentSchema:schema27.properties.privateAccess.anyOf[0].items.oneOf[0].properties.type,data:data9};
if(vErrors === null){
vErrors = [err27];
}
else {
vErrors.push(err27);
}
errors++;
}
if("organization" !== data9){
const err28 = {instancePath:instancePath+"/privateAccess/" + i0+"/type",schemaPath:"https://github.com/data-fair/registry/artefact-patch#/properties/privateAccess/anyOf/0/items/oneOf/0/properties/type/const",keyword:"const",params:{allowedValue: "organization"},message:"must be equal to constant",schema:"organization",parentSchema:schema27.properties.privateAccess.anyOf[0].items.oneOf[0].properties.type,data:data9};
if(vErrors === null){
vErrors = [err28];
}
else {
vErrors.push(err28);
}
errors++;
}
if(errors > 0){
const emErrs7 = [];
for(const err29 of vErrors){
if(!err29.emUsed){
emErrs7.push(err29);
}
}
vErrors = emErrs7;
errors = emErrs7.length;
}
}
if(data8.id !== undefined){
let data10 = data8.id;
if(typeof data10 !== "string"){
const err30 = {instancePath:instancePath+"/privateAccess/" + i0+"/id",schemaPath:"https://github.com/data-fair/registry/artefact-patch#/properties/privateAccess/anyOf/0/items/oneOf/0/properties/id/type",keyword:"type",params:{type: "string"},message:"must be string",schema:schema27.properties.privateAccess.anyOf[0].items.oneOf[0].properties.id.type,parentSchema:schema27.properties.privateAccess.anyOf[0].items.oneOf[0].properties.id,data:data10};
if(vErrors === null){
vErrors = [err30];
}
else {
vErrors.push(err30);
}
errors++;
}
if(errors > 0){
const emErrs8 = [];
for(const err31 of vErrors){
if(!err31.emUsed){
emErrs8.push(err31);
}
}
vErrors = emErrs8;
errors = emErrs8.length;
}
}
}
else {
const err32 = {instancePath:instancePath+"/privateAccess/" + i0,schemaPath:"https://github.com/data-fair/registry/artefact-patch#/properties/privateAccess/anyOf/0/items/oneOf/0/type",keyword:"type",params:{type: "object"},message:"must be object",schema:schema27.properties.privateAccess.anyOf[0].items.oneOf[0].type,parentSchema:schema27.properties.privateAccess.anyOf[0].items.oneOf[0],data:data8};
if(vErrors === null){
vErrors = [err32];
}
else {
vErrors.push(err32);
}
errors++;
}
if(errors > 0){
const emErrors0 = {"required":{"type":[],"id":[]}};
const templates0 = {required:{}};
let emPropParams0;
let emParamsErrors0;
for(const err33 of vErrors){
if((((((err33.keyword !== "errorMessage") && (!err33.emUsed)) && (err33.instancePath === instancePath+"/privateAccess/" + i0)) && (err33.keyword in emErrors0)) && (err33.schemaPath.indexOf("https://github.com/data-fair/registry/artefact-patch#/properties/privateAccess/anyOf/0/items/oneOf/0") === 0)) && (/^\/[^\/]*$/.test(err33.schemaPath.slice(100)))){
emPropParams0 = obj0[err33.keyword];
emParamsErrors0 = emErrors0[err33.keyword][err33.params[emPropParams0]];
if(emParamsErrors0){
emParamsErrors0.push(err33);
err33.emUsed = true;
}
}
}
for(const key4 in emErrors0){
for(const keyProp0 in emErrors0[key4]){
emParamsErrors0 = emErrors0[key4][keyProp0];
if(emParamsErrors0.length){
const tmpl0 = templates0[key4] && templates0[key4][keyProp0];
const err34 = {instancePath:instancePath+"/privateAccess/" + i0,schemaPath:"https://github.com/data-fair/registry/artefact-patch#/properties/privateAccess/anyOf/0/items/oneOf/0/errorMessage",keyword:"errorMessage",params:{errors: emParamsErrors0},message:tmpl0 ? tmpl0() : schema27.properties.privateAccess.anyOf[0].items.oneOf[0].errorMessage[key4][keyProp0],schema:schema27.properties.privateAccess.anyOf[0].items.oneOf[0].errorMessage,parentSchema:schema27.properties.privateAccess.anyOf[0].items.oneOf[0],data:data8};
if(vErrors === null){
vErrors = [err34];
}
else {
vErrors.push(err34);
}
errors++;
}
}
}
const emErrs9 = [];
for(const err35 of vErrors){
if(!err35.emUsed){
emErrs9.push(err35);
}
}
vErrors = emErrs9;
errors = emErrs9.length;
}
var _valid4 = _errs38 === errors;
if(_valid4){
valid10 = true;
passing0 = 0;
var props2 = true;
}
const _errs45 = errors;
if(data8 && typeof data8 == "object" && !Array.isArray(data8)){
if(data8.type === undefined){
const err36 = {instancePath:instancePath+"/privateAccess/" + i0,schemaPath:"https://github.com/data-fair/registry/artefact-patch#/properties/privateAccess/anyOf/0/items/oneOf/1/required",keyword:"required",params:{missingProperty: "type"},message:"must have required property '"+"type"+"'",schema:schema27.properties.privateAccess.anyOf[0].items.oneOf[1].required,parentSchema:schema27.properties.privateAccess.anyOf[0].items.oneOf[1],data:data8};
if(vErrors === null){
vErrors = [err36];
}
else {
vErrors.push(err36);
}
errors++;
}
if(data8.id === undefined){
const err37 = {instancePath:instancePath+"/privateAccess/" + i0,schemaPath:"https://github.com/data-fair/registry/artefact-patch#/properties/privateAccess/anyOf/0/items/oneOf/1/required",keyword:"required",params:{missingProperty: "id"},message:"must have required property '"+"id"+"'",schema:schema27.properties.privateAccess.anyOf[0].items.oneOf[1].required,parentSchema:schema27.properties.privateAccess.anyOf[0].items.oneOf[1],data:data8};
if(vErrors === null){
vErrors = [err37];
}
else {
vErrors.push(err37);
}
errors++;
}
for(const key5 in data8){
if(!((key5 === "type") || (key5 === "id"))){
const err38 = {instancePath:instancePath+"/privateAccess/" + i0,schemaPath:"https://github.com/data-fair/registry/artefact-patch#/properties/privateAccess/anyOf/0/items/oneOf/1/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key5},message:"must NOT have additional properties",schema:false,parentSchema:schema27.properties.privateAccess.anyOf[0].items.oneOf[1],data:data8};
if(vErrors === null){
vErrors = [err38];
}
else {
vErrors.push(err38);
}
errors++;
}
}
if(data8.type !== undefined){
let data11 = data8.type;
if(typeof data11 !== "string"){
const err39 = {instancePath:instancePath+"/privateAccess/" + i0+"/type",schemaPath:"https://github.com/data-fair/registry/artefact-patch#/properties/privateAccess/anyOf/0/items/oneOf/1/properties/type/type",keyword:"type",params:{type: "string"},message:"must be string",schema:schema27.properties.privateAccess.anyOf[0].items.oneOf[1].properties.type.type,parentSchema:schema27.properties.privateAccess.anyOf[0].items.oneOf[1].properties.type,data:data11};
if(vErrors === null){
vErrors = [err39];
}
else {
vErrors.push(err39);
}
errors++;
}
if("user" !== data11){
const err40 = {instancePath:instancePath+"/privateAccess/" + i0+"/type",schemaPath:"https://github.com/data-fair/registry/artefact-patch#/properties/privateAccess/anyOf/0/items/oneOf/1/properties/type/const",keyword:"const",params:{allowedValue: "user"},message:"must be equal to constant",schema:"user",parentSchema:schema27.properties.privateAccess.anyOf[0].items.oneOf[1].properties.type,data:data11};
if(vErrors === null){
vErrors = [err40];
}
else {
vErrors.push(err40);
}
errors++;
}
if(errors > 0){
const emErrs10 = [];
for(const err41 of vErrors){
if(!err41.emUsed){
emErrs10.push(err41);
}
}
vErrors = emErrs10;
errors = emErrs10.length;
}
}
if(data8.id !== undefined){
let data12 = data8.id;
if(typeof data12 !== "string"){
const err42 = {instancePath:instancePath+"/privateAccess/" + i0+"/id",schemaPath:"https://github.com/data-fair/registry/artefact-patch#/properties/privateAccess/anyOf/0/items/oneOf/1/properties/id/type",keyword:"type",params:{type: "string"},message:"must be string",schema:schema27.properties.privateAccess.anyOf[0].items.oneOf[1].properties.id.type,parentSchema:schema27.properties.privateAccess.anyOf[0].items.oneOf[1].properties.id,data:data12};
if(vErrors === null){
vErrors = [err42];
}
else {
vErrors.push(err42);
}
errors++;
}
if(errors > 0){
const emErrs11 = [];
for(const err43 of vErrors){
if(!err43.emUsed){
emErrs11.push(err43);
}
}
vErrors = emErrs11;
errors = emErrs11.length;
}
}
}
else {
const err44 = {instancePath:instancePath+"/privateAccess/" + i0,schemaPath:"https://github.com/data-fair/registry/artefact-patch#/properties/privateAccess/anyOf/0/items/oneOf/1/type",keyword:"type",params:{type: "object"},message:"must be object",schema:schema27.properties.privateAccess.anyOf[0].items.oneOf[1].type,parentSchema:schema27.properties.privateAccess.anyOf[0].items.oneOf[1],data:data8};
if(vErrors === null){
vErrors = [err44];
}
else {
vErrors.push(err44);
}
errors++;
}
if(errors > 0){
const emErrors1 = {"required":{"type":[],"id":[]}};
const templates1 = {required:{}};
let emPropParams1;
let emParamsErrors1;
for(const err45 of vErrors){
if((((((err45.keyword !== "errorMessage") && (!err45.emUsed)) && (err45.instancePath === instancePath+"/privateAccess/" + i0)) && (err45.keyword in emErrors1)) && (err45.schemaPath.indexOf("https://github.com/data-fair/registry/artefact-patch#/properties/privateAccess/anyOf/0/items/oneOf/1") === 0)) && (/^\/[^\/]*$/.test(err45.schemaPath.slice(100)))){
emPropParams1 = obj0[err45.keyword];
emParamsErrors1 = emErrors1[err45.keyword][err45.params[emPropParams1]];
if(emParamsErrors1){
emParamsErrors1.push(err45);
err45.emUsed = true;
}
}
}
for(const key6 in emErrors1){
for(const keyProp1 in emErrors1[key6]){
emParamsErrors1 = emErrors1[key6][keyProp1];
if(emParamsErrors1.length){
const tmpl1 = templates1[key6] && templates1[key6][keyProp1];
const err46 = {instancePath:instancePath+"/privateAccess/" + i0,schemaPath:"https://github.com/data-fair/registry/artefact-patch#/properties/privateAccess/anyOf/0/items/oneOf/1/errorMessage",keyword:"errorMessage",params:{errors: emParamsErrors1},message:tmpl1 ? tmpl1() : schema27.properties.privateAccess.anyOf[0].items.oneOf[1].errorMessage[key6][keyProp1],schema:schema27.properties.privateAccess.anyOf[0].items.oneOf[1].errorMessage,parentSchema:schema27.properties.privateAccess.anyOf[0].items.oneOf[1],data:data8};
if(vErrors === null){
vErrors = [err46];
}
else {
vErrors.push(err46);
}
errors++;
}
}
}
const emErrs12 = [];
for(const err47 of vErrors){
if(!err47.emUsed){
emErrs12.push(err47);
}
}
vErrors = emErrs12;
errors = emErrs12.length;
}
var _valid4 = _errs45 === errors;
if(_valid4 && valid10){
valid10 = false;
passing0 = [passing0, 1];
}
else {
if(_valid4){
valid10 = true;
passing0 = 1;
if(props2 !== true){
props2 = true;
}
}
}
if(!valid10){
const err48 = {instancePath:instancePath+"/privateAccess/" + i0,schemaPath:"https://github.com/data-fair/registry/artefact-patch#/properties/privateAccess/anyOf/0/items/oneOf",keyword:"oneOf",params:{passingSchemas: passing0},message:"must match exactly one schema in oneOf",schema:schema27.properties.privateAccess.anyOf[0].items.oneOf,parentSchema:schema27.properties.privateAccess.anyOf[0].items,data:data8};
if(vErrors === null){
vErrors = [err48];
}
else {
vErrors.push(err48);
}
errors++;
}
else {
errors = _errs37;
if(vErrors !== null){
if(_errs37){
vErrors.length = _errs37;
}
else {
vErrors = null;
}
}
}
if(errors > 0){
const emErrors2 = {"oneOf":[]};
const templates2 = {};
for(const err49 of vErrors){
if((((((err49.keyword !== "errorMessage") && (!err49.emUsed)) && (err49.instancePath === instancePath+"/privateAccess/" + i0)) && (err49.keyword in emErrors2)) && (err49.schemaPath.indexOf("https://github.com/data-fair/registry/artefact-patch#/properties/privateAccess/anyOf/0/items") === 0)) && (/^\/[^\/]*$/.test(err49.schemaPath.slice(92)))){
emErrors2[err49.keyword].push(err49);
err49.emUsed = true;
}
}
for(const key7 in emErrors2){
if(emErrors2[key7].length){
const err50 = {instancePath:instancePath+"/privateAccess/" + i0,schemaPath:"https://github.com/data-fair/registry/artefact-patch#/properties/privateAccess/anyOf/0/items/errorMessage",keyword:"errorMessage",params:{errors: emErrors2[key7]},message:key7 in templates2 ? templates2[key7]() : schema27.properties.privateAccess.anyOf[0].items.errorMessage[key7],schema:schema27.properties.privateAccess.anyOf[0].items.errorMessage,parentSchema:schema27.properties.privateAccess.anyOf[0].items,data:data8};
if(vErrors === null){
vErrors = [err50];
}
else {
vErrors.push(err50);
}
errors++;
}
}
const emErrs13 = [];
for(const err51 of vErrors){
if(!err51.emUsed){
emErrs13.push(err51);
}
}
vErrors = emErrs13;
errors = emErrs13.length;
}
}
}
else {
const err52 = {instancePath:instancePath+"/privateAccess",schemaPath:"https://github.com/data-fair/registry/artefact-patch#/properties/privateAccess/anyOf/0/type",keyword:"type",params:{type: "array"},message:"must be array",schema:schema27.properties.privateAccess.anyOf[0].type,parentSchema:schema27.properties.privateAccess.anyOf[0],data:data7};
if(vErrors === null){
vErrors = [err52];
}
else {
vErrors.push(err52);
}
errors++;
}
var _valid3 = _errs33 === errors;
valid7 = valid7 || _valid3;
const _errs52 = errors;
if(data7 !== null){
const err53 = {instancePath:instancePath+"/privateAccess",schemaPath:"https://github.com/data-fair/registry/artefact-patch#/properties/privateAccess/anyOf/1/type",keyword:"type",params:{type: "null"},message:"must be null",schema:schema27.properties.privateAccess.anyOf[1].type,parentSchema:schema27.properties.privateAccess.anyOf[1],data:data7};
if(vErrors === null){
vErrors = [err53];
}
else {
vErrors.push(err53);
}
errors++;
}
var _valid3 = _errs52 === errors;
valid7 = valid7 || _valid3;
if(!valid7){
const err54 = {instancePath:instancePath+"/privateAccess",schemaPath:"https://github.com/data-fair/registry/artefact-patch#/properties/privateAccess/anyOf",keyword:"anyOf",params:{},message:"must match a schema in anyOf",schema:schema27.properties.privateAccess.anyOf,parentSchema:schema27.properties.privateAccess,data:data7};
if(vErrors === null){
vErrors = [err54];
}
else {
vErrors.push(err54);
}
errors++;
}
else {
errors = _errs32;
if(vErrors !== null){
if(_errs32){
vErrors.length = _errs32;
}
else {
vErrors = null;
}
}
}
if(errors > 0){
const emErrs14 = [];
for(const err55 of vErrors){
if(!err55.emUsed){
emErrs14.push(err55);
}
}
vErrors = emErrs14;
errors = emErrs14.length;
}
}
if(data.processingConfigSchema !== undefined){
let data13 = data.processingConfigSchema;
const _errs55 = errors;
let valid13 = false;
const _errs56 = errors;
if(!(data13 && typeof data13 == "object" && !Array.isArray(data13))){
const err56 = {instancePath:instancePath+"/processingConfigSchema",schemaPath:"https://github.com/data-fair/registry/artefact-patch#/properties/processingConfigSchema/anyOf/0/type",keyword:"type",params:{type: "object"},message:"must be object",schema:schema27.properties.processingConfigSchema.anyOf[0].type,parentSchema:schema27.properties.processingConfigSchema.anyOf[0],data:data13};
if(vErrors === null){
vErrors = [err56];
}
else {
vErrors.push(err56);
}
errors++;
}
var _valid5 = _errs56 === errors;
valid13 = valid13 || _valid5;
const _errs58 = errors;
if(data13 !== null){
const err57 = {instancePath:instancePath+"/processingConfigSchema",schemaPath:"https://github.com/data-fair/registry/artefact-patch#/properties/processingConfigSchema/anyOf/1/type",keyword:"type",params:{type: "null"},message:"must be null",schema:schema27.properties.processingConfigSchema.anyOf[1].type,parentSchema:schema27.properties.processingConfigSchema.anyOf[1],data:data13};
if(vErrors === null){
vErrors = [err57];
}
else {
vErrors.push(err57);
}
errors++;
}
var _valid5 = _errs58 === errors;
valid13 = valid13 || _valid5;
if(!valid13){
const err58 = {instancePath:instancePath+"/processingConfigSchema",schemaPath:"https://github.com/data-fair/registry/artefact-patch#/properties/processingConfigSchema/anyOf",keyword:"anyOf",params:{},message:"must match a schema in anyOf",schema:schema27.properties.processingConfigSchema.anyOf,parentSchema:schema27.properties.processingConfigSchema,data:data13};
if(vErrors === null){
vErrors = [err58];
}
else {
vErrors.push(err58);
}
errors++;
}
else {
errors = _errs55;
if(vErrors !== null){
if(_errs55){
vErrors.length = _errs55;
}
else {
vErrors = null;
}
}
}
if(errors > 0){
const emErrs15 = [];
for(const err59 of vErrors){
if(!err59.emUsed){
emErrs15.push(err59);
}
}
vErrors = emErrs15;
errors = emErrs15.length;
}
}
if(data.applicationConfigSchema !== undefined){
let data14 = data.applicationConfigSchema;
const _errs61 = errors;
let valid14 = false;
const _errs62 = errors;
if(!(data14 && typeof data14 == "object" && !Array.isArray(data14))){
const err60 = {instancePath:instancePath+"/applicationConfigSchema",schemaPath:"https://github.com/data-fair/registry/artefact-patch#/properties/applicationConfigSchema/anyOf/0/type",keyword:"type",params:{type: "object"},message:"must be object",schema:schema27.properties.applicationConfigSchema.anyOf[0].type,parentSchema:schema27.properties.applicationConfigSchema.anyOf[0],data:data14};
if(vErrors === null){
vErrors = [err60];
}
else {
vErrors.push(err60);
}
errors++;
}
var _valid6 = _errs62 === errors;
valid14 = valid14 || _valid6;
const _errs64 = errors;
if(data14 !== null){
const err61 = {instancePath:instancePath+"/applicationConfigSchema",schemaPath:"https://github.com/data-fair/registry/artefact-patch#/properties/applicationConfigSchema/anyOf/1/type",keyword:"type",params:{type: "null"},message:"must be null",schema:schema27.properties.applicationConfigSchema.anyOf[1].type,parentSchema:schema27.properties.applicationConfigSchema.anyOf[1],data:data14};
if(vErrors === null){
vErrors = [err61];
}
else {
vErrors.push(err61);
}
errors++;
}
var _valid6 = _errs64 === errors;
valid14 = valid14 || _valid6;
if(!valid14){
const err62 = {instancePath:instancePath+"/applicationConfigSchema",schemaPath:"https://github.com/data-fair/registry/artefact-patch#/properties/applicationConfigSchema/anyOf",keyword:"anyOf",params:{},message:"must match a schema in anyOf",schema:schema27.properties.applicationConfigSchema.anyOf,parentSchema:schema27.properties.applicationConfigSchema,data:data14};
if(vErrors === null){
vErrors = [err62];
}
else {
vErrors.push(err62);
}
errors++;
}
else {
errors = _errs61;
if(vErrors !== null){
if(_errs61){
vErrors.length = _errs61;
}
else {
vErrors = null;
}
}
}
if(errors > 0){
const emErrs16 = [];
for(const err63 of vErrors){
if(!err63.emUsed){
emErrs16.push(err63);
}
}
vErrors = emErrs16;
errors = emErrs16.length;
}
}
}
else {
const err64 = {instancePath,schemaPath:"https://github.com/data-fair/registry/artefact-patch#/type",keyword:"type",params:{type: "object"},message:"must be object",schema:schema27.type,parentSchema:schema27,data};
if(vErrors === null){
vErrors = [err64];
}
else {
vErrors.push(err64);
}
errors++;
}
if(errors > 0){
const emErrs17 = [];
for(const err65 of vErrors){
if(!err65.emUsed){
emErrs17.push(err65);
}
}
vErrors = emErrs17;
errors = emErrs17.length;
}
validate26.errors = vErrors;
return errors === 0;
}
validate26.evaluated = {"props":true,"dynamicProps":false,"dynamicItems":false};
function expression0(data,value,options,context,display,layout,readOnly,summary,validates
) {
return (layout.defaultData)
}function expression1(data,value,options,context,display,layout,readOnly,summary,validates
) {
return (layout.props)
}function expression2(data,value,options,context,display,layout,readOnly,summary,validates,rootData,parent
) {
return (!parent.data?.public)
}function expression3(data,value,options,context,display,layout,readOnly,summary,validates
) {
return (layout.constData)
}function expression4(data,value,options,context,display,layout,readOnly,summary,validates
) {
return `/simple-directory/api/organizations?size=20`
}function expression5(data,item,options,context,display,layout,readOnly,summary,validates
) {
return (`${item.name} (${item.id})`)
}function expression6(data,item,options,context,display,layout,readOnly,summary,validates
) {
return (item.id)
}function expression7(data,item,options,context,display,layout,readOnly,summary,validates
) {
return (`/simple-directory/api/avatars/organization/${item.id}/avatar.png`)
}function expression8(data,body,options,context,display,layout,readOnly,summary,validates
) {
return (data.results)
}function expression9(data,value,options,context,display,layout,readOnly,summary,validates
) {
return `/simple-directory/api/users?size=20`
}function expression10(data,item,options,context,display,layout,readOnly,summary,validates
) {
return (`/simple-directory/api/avatars/user/${item.id}/avatar.png`)
}

const compiledLayout = {
  mainTree: "https://github.com/data-fair/registry/artefact-patch#",

  skeletonTrees: {
    "https://github.com/data-fair/registry/artefact-patch#": {
      title: "Artefact patch",
      root: "https://github.com/data-fair/registry/artefact-patch#",
      refPointer: "https://github.com/data-fair/registry/artefact-patch#",
      discriminatorValue: undefined
    },

    "https://github.com/data-fair/registry/artefact-patch#/properties/privateAccess/anyOf/0/items": {
      title: "",
      root: "https://github.com/data-fair/registry/artefact-patch#/properties/privateAccess/anyOf/0/items",
      refPointer: "https://github.com/data-fair/registry/artefact-patch#/properties/privateAccess/anyOf/0/items",
      discriminatorValue: undefined
    },

    "https://github.com/data-fair/registry/artefact-patch#/properties/privateAccess/anyOf/0/items/oneOf/0": {
      title: "Organisation",
      root: "https://github.com/data-fair/registry/artefact-patch#/properties/privateAccess/anyOf/0/items/oneOf/0",
      refPointer: "https://github.com/data-fair/registry/artefact-patch#/properties/privateAccess/anyOf/0/items/oneOf/0",
      discriminatorValue: "organization"
    },

    "https://github.com/data-fair/registry/artefact-patch#/properties/privateAccess/anyOf/0/items/oneOf/1": {
      title: "Utilisateur",
      root: "https://github.com/data-fair/registry/artefact-patch#/properties/privateAccess/anyOf/0/items/oneOf/1",
      refPointer: "https://github.com/data-fair/registry/artefact-patch#/properties/privateAccess/anyOf/0/items/oneOf/1",
      discriminatorValue: "user"
    }
  },

  skeletonNodes: {
    "https://github.com/data-fair/registry/artefact-patch#": {
      title: "Artefact patch",
      key: "",
      pointer: "https://github.com/data-fair/registry/artefact-patch#",
      refPointer: "https://github.com/data-fair/registry/artefact-patch#",
      pure: false,
      propertyKeys: ["title", "description", "public", "privateAccess", "processingConfigSchema", "applicationConfigSchema"],
      roPropertyKeys: [],
      nullable: false,
      required: true,
      children: ["https://github.com/data-fair/registry/artefact-patch#/properties/title", "https://github.com/data-fair/registry/artefact-patch#/properties/description", "https://github.com/data-fair/registry/artefact-patch#/properties/public", "https://github.com/data-fair/registry/artefact-patch#/properties/privateAccess", "https://github.com/data-fair/registry/artefact-patch#/properties/processingConfigSchema", "https://github.com/data-fair/registry/artefact-patch#/properties/applicationConfigSchema"]
    },

    "https://github.com/data-fair/registry/artefact-patch#/properties/title": {
      title: undefined,
      key: "title",
      pointer: "https://github.com/data-fair/registry/artefact-patch#/properties/title/anyOf/0",
      refPointer: "https://github.com/data-fair/registry/artefact-patch#/properties/title/anyOf/0",
      pure: true,
      propertyKeys: ["en", "fr"],
      roPropertyKeys: [],
      nullable: true,
      required: undefined,
      children: ["https://github.com/data-fair/registry/artefact-patch#/properties/title/anyOf/0/properties/en", "https://github.com/data-fair/registry/artefact-patch#/properties/title/anyOf/0/properties/fr"]
    },

    "https://github.com/data-fair/registry/artefact-patch#/properties/title/anyOf/0/properties/en": {
      title: "Titre - Anglais",
      key: "en",
      pointer: "https://github.com/data-fair/registry/artefact-patch#/properties/title/anyOf/0/properties/en",
      refPointer: "https://github.com/data-fair/registry/artefact-patch#/properties/title/anyOf/0/properties/en",
      pure: true,
      propertyKeys: [],
      roPropertyKeys: [],
      nullable: false,
      required: undefined
    },

    "https://github.com/data-fair/registry/artefact-patch#/properties/title/anyOf/0/properties/fr": {
      title: "Titre - Français",
      key: "fr",
      pointer: "https://github.com/data-fair/registry/artefact-patch#/properties/title/anyOf/0/properties/fr",
      refPointer: "https://github.com/data-fair/registry/artefact-patch#/properties/title/anyOf/0/properties/fr",
      pure: true,
      propertyKeys: [],
      roPropertyKeys: [],
      nullable: false,
      required: undefined
    },

    "https://github.com/data-fair/registry/artefact-patch#/properties/description": {
      title: undefined,
      key: "description",
      pointer: "https://github.com/data-fair/registry/artefact-patch#/properties/description/anyOf/0",
      refPointer: "https://github.com/data-fair/registry/artefact-patch#/properties/description/anyOf/0",
      pure: true,
      propertyKeys: ["en", "fr"],
      roPropertyKeys: [],
      nullable: true,
      required: undefined,
      children: ["https://github.com/data-fair/registry/artefact-patch#/properties/description/anyOf/0/properties/en", "https://github.com/data-fair/registry/artefact-patch#/properties/description/anyOf/0/properties/fr"]
    },

    "https://github.com/data-fair/registry/artefact-patch#/properties/description/anyOf/0/properties/en": {
      title: "Description - Anglais",
      key: "en",
      pointer: "https://github.com/data-fair/registry/artefact-patch#/properties/description/anyOf/0/properties/en",
      refPointer: "https://github.com/data-fair/registry/artefact-patch#/properties/description/anyOf/0/properties/en",
      pure: true,
      propertyKeys: [],
      roPropertyKeys: [],
      nullable: false,
      required: undefined
    },

    "https://github.com/data-fair/registry/artefact-patch#/properties/description/anyOf/0/properties/fr": {
      title: "Description - Français",
      key: "fr",
      pointer: "https://github.com/data-fair/registry/artefact-patch#/properties/description/anyOf/0/properties/fr",
      refPointer: "https://github.com/data-fair/registry/artefact-patch#/properties/description/anyOf/0/properties/fr",
      pure: true,
      propertyKeys: [],
      roPropertyKeys: [],
      nullable: false,
      required: undefined
    },

    "https://github.com/data-fair/registry/artefact-patch#/properties/public": {
      title: "Public",
      key: "public",
      pointer: "https://github.com/data-fair/registry/artefact-patch#/properties/public/anyOf/0",
      refPointer: "https://github.com/data-fair/registry/artefact-patch#/properties/public/anyOf/0",
      pure: true,
      propertyKeys: [],
      roPropertyKeys: [],
      nullable: true,
      required: undefined
    },

    "https://github.com/data-fair/registry/artefact-patch#/properties/privateAccess": {
      title: "Accès privés",
      key: "privateAccess",
      pointer: "https://github.com/data-fair/registry/artefact-patch#/properties/privateAccess/anyOf/0",
      refPointer: "https://github.com/data-fair/registry/artefact-patch#/properties/privateAccess/anyOf/0",
      pure: false,
      propertyKeys: [],
      roPropertyKeys: [],
      nullable: true,
      required: undefined,
      childrenTrees: ["https://github.com/data-fair/registry/artefact-patch#/properties/privateAccess/anyOf/0/items"]
    },

    "https://github.com/data-fair/registry/artefact-patch#/properties/privateAccess/anyOf/0/items": {
      title: undefined,
      key: "",
      pointer: "https://github.com/data-fair/registry/artefact-patch#/properties/privateAccess/anyOf/0/items",
      refPointer: "https://github.com/data-fair/registry/artefact-patch#/properties/privateAccess/anyOf/0/items",
      pure: true,
      propertyKeys: ["type", "id"],
      roPropertyKeys: [],
      nullable: false,
      required: true,
      children: ["https://github.com/data-fair/registry/artefact-patch#/properties/privateAccess/anyOf/0/items/oneOf"]
    },

    "https://github.com/data-fair/registry/artefact-patch#/properties/privateAccess/anyOf/0/items/oneOf/0": {
      key: "",
      pointer: "https://github.com/data-fair/registry/artefact-patch#/properties/privateAccess/anyOf/0/items/oneOf/0",
      refPointer: "https://github.com/data-fair/registry/artefact-patch#/properties/privateAccess/anyOf/0/items/oneOf/0",
      pure: true,
      propertyKeys: ["type", "id"],
      roPropertyKeys: [],
      nullable: false,
      required: true,
      children: ["https://github.com/data-fair/registry/artefact-patch#/properties/privateAccess/anyOf/0/items/oneOf/0/properties/type", "https://github.com/data-fair/registry/artefact-patch#/properties/privateAccess/anyOf/0/items/oneOf/0/properties/id"]
    },

    "https://github.com/data-fair/registry/artefact-patch#/properties/privateAccess/anyOf/0/items/oneOf/0/properties/type": {
      title: undefined,
      key: "type",
      pointer: "https://github.com/data-fair/registry/artefact-patch#/properties/privateAccess/anyOf/0/items/oneOf/0/properties/type",
      refPointer: "https://github.com/data-fair/registry/artefact-patch#/properties/privateAccess/anyOf/0/items/oneOf/0/properties/type",
      pure: true,
      propertyKeys: [],
      roPropertyKeys: [],
      nullable: false,
      required: true
    },

    "https://github.com/data-fair/registry/artefact-patch#/properties/privateAccess/anyOf/0/items/oneOf/0/properties/id": {
      title: "Organisation",
      key: "id",
      pointer: "https://github.com/data-fair/registry/artefact-patch#/properties/privateAccess/anyOf/0/items/oneOf/0/properties/id",
      refPointer: "https://github.com/data-fair/registry/artefact-patch#/properties/privateAccess/anyOf/0/items/oneOf/0/properties/id",
      pure: true,
      propertyKeys: [],
      roPropertyKeys: [],
      nullable: false,
      required: true
    },

    "https://github.com/data-fair/registry/artefact-patch#/properties/privateAccess/anyOf/0/items/oneOf/1": {
      key: "",
      pointer: "https://github.com/data-fair/registry/artefact-patch#/properties/privateAccess/anyOf/0/items/oneOf/1",
      refPointer: "https://github.com/data-fair/registry/artefact-patch#/properties/privateAccess/anyOf/0/items/oneOf/1",
      pure: true,
      propertyKeys: ["type", "id"],
      roPropertyKeys: [],
      nullable: false,
      required: true,
      children: ["https://github.com/data-fair/registry/artefact-patch#/properties/privateAccess/anyOf/0/items/oneOf/1/properties/type", "https://github.com/data-fair/registry/artefact-patch#/properties/privateAccess/anyOf/0/items/oneOf/1/properties/id"]
    },

    "https://github.com/data-fair/registry/artefact-patch#/properties/privateAccess/anyOf/0/items/oneOf/1/properties/type": {
      title: undefined,
      key: "type",
      pointer: "https://github.com/data-fair/registry/artefact-patch#/properties/privateAccess/anyOf/0/items/oneOf/1/properties/type",
      refPointer: "https://github.com/data-fair/registry/artefact-patch#/properties/privateAccess/anyOf/0/items/oneOf/1/properties/type",
      pure: true,
      propertyKeys: [],
      roPropertyKeys: [],
      nullable: false,
      required: true
    },

    "https://github.com/data-fair/registry/artefact-patch#/properties/privateAccess/anyOf/0/items/oneOf/1/properties/id": {
      title: "Utilisateur",
      key: "id",
      pointer: "https://github.com/data-fair/registry/artefact-patch#/properties/privateAccess/anyOf/0/items/oneOf/1/properties/id",
      refPointer: "https://github.com/data-fair/registry/artefact-patch#/properties/privateAccess/anyOf/0/items/oneOf/1/properties/id",
      pure: true,
      propertyKeys: [],
      roPropertyKeys: [],
      nullable: false,
      required: true
    },

    "https://github.com/data-fair/registry/artefact-patch#/properties/privateAccess/anyOf/0/items/oneOf": {
      key: "$oneOf",
      pointer: "https://github.com/data-fair/registry/artefact-patch#/properties/privateAccess/anyOf/0/items/oneOf",
      refPointer: "https://github.com/data-fair/registry/artefact-patch#/properties/privateAccess/anyOf/0/items/oneOf",
      childrenTrees: ["https://github.com/data-fair/registry/artefact-patch#/properties/privateAccess/anyOf/0/items/oneOf/0", "https://github.com/data-fair/registry/artefact-patch#/properties/privateAccess/anyOf/0/items/oneOf/1"],
      discriminator: "type",
      pure: true,
      propertyKeys: ["type", "id"],
      roPropertyKeys: []
    },

    "https://github.com/data-fair/registry/artefact-patch#/properties/processingConfigSchema": {
      title: undefined,
      key: "processingConfigSchema",
      pointer: "https://github.com/data-fair/registry/artefact-patch#/properties/processingConfigSchema/anyOf/0",
      refPointer: "https://github.com/data-fair/registry/artefact-patch#/properties/processingConfigSchema/anyOf/0",
      pure: true,
      propertyKeys: [],
      roPropertyKeys: [],
      nullable: true,
      required: undefined
    },

    "https://github.com/data-fair/registry/artefact-patch#/properties/applicationConfigSchema": {
      title: undefined,
      key: "applicationConfigSchema",
      pointer: "https://github.com/data-fair/registry/artefact-patch#/properties/applicationConfigSchema/anyOf/0",
      refPointer: "https://github.com/data-fair/registry/artefact-patch#/properties/applicationConfigSchema/anyOf/0",
      pure: true,
      propertyKeys: [],
      roPropertyKeys: [],
      nullable: true,
      required: undefined
    }
  },

  normalizedLayouts: {
    "https://github.com/data-fair/registry/artefact-patch#": {
      title: null,
      comp: "section",

      children: [{
        key: "title"
      }, {
        key: "description"
      }, {
        key: "public"
      }, {
        key: "privateAccess"
      }, {
        key: "processingConfigSchema"
      }, {
        key: "applicationConfigSchema"
      }],

      defaultData: {},

      getDefaultData: {
        type: "js-eval",
        expr: "layout.defaultData",
        pure: true,
        dataAlias: "value",
        ref: 0
      }
    },

    "https://github.com/data-fair/registry/artefact-patch#/properties/title/anyOf/0": {
      comp: "section",
      nullable: true,

      children: [{
        key: "en"
      }, {
        key: "fr"
      }],

      title: null
    },

    "https://github.com/data-fair/registry/artefact-patch#/properties/title/anyOf/0/properties/en": {
      cols: {
        xs: 12,
        md: 6
      },

      comp: "text-field",
      label: "Titre - Anglais"
    },

    "https://github.com/data-fair/registry/artefact-patch#/properties/title/anyOf/0/properties/fr": {
      cols: {
        xs: 12,
        md: 6
      },

      comp: "text-field",
      label: "Titre - Français"
    },

    "https://github.com/data-fair/registry/artefact-patch#/properties/description/anyOf/0": {
      comp: "section",
      nullable: true,

      children: [{
        key: "en"
      }, {
        key: "fr"
      }],

      title: null
    },

    "https://github.com/data-fair/registry/artefact-patch#/properties/description/anyOf/0/properties/en": {
      comp: "textarea",

      props: {
        autoGrow: true,
        rows: 3
      },

      cols: {
        xs: 12,
        md: 6
      },

      label: "Description - Anglais",

      getProps: {
        type: "js-eval",
        expr: "layout.props",
        pure: true,
        dataAlias: "value",
        ref: 1
      }
    },

    "https://github.com/data-fair/registry/artefact-patch#/properties/description/anyOf/0/properties/fr": {
      comp: "textarea",

      props: {
        autoGrow: true,
        rows: 3
      },

      cols: {
        xs: 12,
        md: 6
      },

      label: "Description - Français",

      getProps: {
        type: "js-eval",
        expr: "layout.props",
        pure: true,
        dataAlias: "value",
        ref: 1
      }
    },

    "https://github.com/data-fair/registry/artefact-patch#/properties/public/anyOf/0": {
      comp: "switch",
      nullable: true,
      label: "Public",
      defaultData: false,

      getDefaultData: {
        type: "js-eval",
        expr: "layout.defaultData",
        pure: true,
        dataAlias: "value",
        ref: 0
      }
    },

    "https://github.com/data-fair/registry/artefact-patch#/properties/privateAccess/anyOf/0": {
      if: {
        type: "js-eval",
        expr: "!parent.data?.public",
        pure: false,
        dataAlias: "value",
        ref: 2
      },

      comp: "list",
      nullable: true,
      title: "Accès privés",
      listEditMode: "inline-single",
      listActions: ["add", "edit", "delete", "sort", "duplicate"]
    },

    "https://github.com/data-fair/registry/artefact-patch#/properties/privateAccess/anyOf/0/items": {
      comp: "section",

      children: [{
        key: "$oneOf"
      }],

      title: null,
      defaultData: {},

      getDefaultData: {
        type: "js-eval",
        expr: "layout.defaultData",
        pure: true,
        dataAlias: "value",
        ref: 0
      },

      nullable: true
    },

    "https://github.com/data-fair/registry/artefact-patch#/properties/privateAccess/anyOf/0/items/oneOf": {
      emptyData: true,
      comp: "one-of-select",

      oneOfItems: [{
        key: 0,
        title: "Organisation"
      }, {
        key: 1,
        title: "Utilisateur"
      }],

      defaultData: {},

      getDefaultData: {
        type: "js-eval",
        expr: "layout.defaultData",
        pure: true,
        dataAlias: "value",
        ref: 0
      }
    },

    "https://github.com/data-fair/registry/artefact-patch#/properties/privateAccess/anyOf/0/items/oneOf/0": {
      comp: "section",

      children: [{
        key: "type"
      }, {
        key: "id"
      }],

      title: "Organisation",
      defaultData: {},

      getDefaultData: {
        type: "js-eval",
        expr: "layout.defaultData",
        pure: true,
        dataAlias: "value",
        ref: 0
      }
    },

    "https://github.com/data-fair/registry/artefact-patch#/properties/privateAccess/anyOf/0/items/oneOf/0/properties/type": {
      comp: "none",
      constData: "organization",

      getConstData: {
        type: "js-eval",
        expr: "layout.constData",
        pure: true,
        dataAlias: "value",
        ref: 3
      }
    },

    "https://github.com/data-fair/registry/artefact-patch#/properties/privateAccess/anyOf/0/items/oneOf/0/properties/id": {
      getItems: {
        url: {
          type: "js-tpl",
          expr: "/simple-directory/api/organizations?size=20",
          pure: true,
          dataAlias: "value",
          ref: 4
        },

        qSearchParam: "q",

        itemsResults: {
          type: "js-eval",
          expr: "data.results",
          pure: true,
          dataAlias: "body",
          ref: 8
        },

        itemTitle: {
          type: "js-eval",
          expr: "`${item.name} (${item.id})`",
          pure: true,
          dataAlias: "item",
          ref: 5
        },

        itemValue: {
          type: "js-eval",
          expr: "item.id",
          pure: true,
          dataAlias: "item",
          ref: 6
        },

        itemIcon: {
          type: "js-eval",
          expr: "`/simple-directory/api/avatars/organization/${item.id}/avatar.png`",
          pure: true,
          dataAlias: "item",
          ref: 7
        }
      },

      comp: "autocomplete",
      label: "Organisation"
    },

    "https://github.com/data-fair/registry/artefact-patch#/properties/privateAccess/anyOf/0/items/oneOf/1": {
      comp: "section",

      children: [{
        key: "type"
      }, {
        key: "id"
      }],

      title: "Utilisateur",
      defaultData: {},

      getDefaultData: {
        type: "js-eval",
        expr: "layout.defaultData",
        pure: true,
        dataAlias: "value",
        ref: 0
      }
    },

    "https://github.com/data-fair/registry/artefact-patch#/properties/privateAccess/anyOf/0/items/oneOf/1/properties/type": {
      comp: "none",
      constData: "user",

      getConstData: {
        type: "js-eval",
        expr: "layout.constData",
        pure: true,
        dataAlias: "value",
        ref: 3
      }
    },

    "https://github.com/data-fair/registry/artefact-patch#/properties/privateAccess/anyOf/0/items/oneOf/1/properties/id": {
      getItems: {
        url: {
          type: "js-tpl",
          expr: "/simple-directory/api/users?size=20",
          pure: true,
          dataAlias: "value",
          ref: 9
        },

        qSearchParam: "q",

        itemsResults: {
          type: "js-eval",
          expr: "data.results",
          pure: true,
          dataAlias: "body",
          ref: 8
        },

        itemTitle: {
          type: "js-eval",
          expr: "`${item.name} (${item.id})`",
          pure: true,
          dataAlias: "item",
          ref: 5
        },

        itemValue: {
          type: "js-eval",
          expr: "item.id",
          pure: true,
          dataAlias: "item",
          ref: 6
        },

        itemIcon: {
          type: "js-eval",
          expr: "`/simple-directory/api/avatars/user/${item.id}/avatar.png`",
          pure: true,
          dataAlias: "item",
          ref: 10
        }
      },

      comp: "autocomplete",
      label: "Utilisateur"
    },

    "https://github.com/data-fair/registry/artefact-patch#/properties/processingConfigSchema/anyOf/0": {
      comp: "none"
    },

    "https://github.com/data-fair/registry/artefact-patch#/properties/applicationConfigSchema/anyOf/0": {
      comp: "none"
    }
  },

  validates: {
    "https://github.com/data-fair/registry/artefact-patch#/properties/privateAccess/anyOf/0/items/oneOf/0": validate22,
    "https://github.com/data-fair/registry/artefact-patch#/properties/privateAccess/anyOf/0/items/oneOf/1": validate24,
    "https://github.com/data-fair/registry/artefact-patch#/properties/privateAccess/anyOf/0/items": validate25,
    "https://github.com/data-fair/registry/artefact-patch#": validate26
  },

  validationErrors: {},
  expressions: [expression0, expression1, expression2, expression3, expression4, expression5, expression6, expression7, expression8, expression9, expression10],
  locale: "fr",

  messages: {
    errorOneOf: "choisissez une valeur",
    errorRequired: "information obligatoire",
    addItem: "Ajouter un élément",
    delete: "Supprimer",
    edit: "Éditer",
    confirm: "Confirmer",
    close: "Fermer",
    duplicate: "Dupliquer",
    copy: "Copier",
    paste: "Coller",
    sort: "Trier",
    up: "Décaler vers le haut",
    down: "Décaler vers le bas",
    showHelp: "Afficher un message d'aide",
    default: "défaut : ",
    name: "nom : ",
    examples: "Exemples : ",
    deprecated: "Attention, cette information est obsolète.",
    keyboardDate: "JJ/MM/AAAA",
    keyboardDateTime: "JJ/MM/AAAA HH:mm"
  },

  components: {
    none: {
      name: "none"
    },

    slot: {
      name: "slot"
    },

    "composite-slot": {
      name: "composite-slot",
      composite: true
    },

    section: {
      name: "section",
      composite: true
    },

    tabs: {
      name: "tabs",
      composite: true
    },

    "vertical-tabs": {
      name: "vertical-tabs",
      composite: true
    },

    "expansion-panels": {
      name: "expansion-panels",
      composite: true
    },

    stepper: {
      name: "stepper",
      composite: true
    },

    card: {
      name: "card",
      composite: true
    },

    list: {
      name: "list",
      itemsBased: true,

      schema: {
        required: ["listEditMode", "listActions"],

        properties: {
          title: {
            type: "string"
          },

          listEditMode: {
            type: "string",
            enum: ["inline", "inline-single", "menu", "dialog"]
          },

          listActions: {
            type: "array",

            items: {
              type: "string",
              enum: ["add", "edit", "delete", "sort", "duplicate", "copy", "paste"]
            }
          },

          clipboardKey: {
            type: "string"
          },

          itemTitle: {
            $ref: "https://json-layout.github.io/normalized-layout-keyword#/$defs/expression"
          },

          itemSubtitle: {
            $ref: "https://json-layout.github.io/normalized-layout-keyword#/$defs/expression"
          },

          itemCopy: {
            $ref: "https://json-layout.github.io/normalized-layout-keyword#/$defs/expression"
          },

          indexed: {
            type: "array",

            items: {
              type: "string"
            }
          },

          messages: {
            type: "object",
            additionalProperties: false,

            properties: {
              addItem: {
                type: "string"
              },

              delete: {
                type: "string"
              },

              edit: {
                type: "string"
              },

              duplicate: {
                type: "string"
              },

              sort: {
                type: "string"
              }
            }
          }
        }
      }
    },

    "text-field": {
      name: "text-field",
      shouldDebounce: true,
      focusable: true,
      emitsBlur: true,

      schema: {
        properties: {
          placeholder: {
            type: "string"
          }
        }
      }
    },

    textarea: {
      name: "textarea",
      shouldDebounce: true,
      focusable: true,
      emitsBlur: true,

      schema: {
        properties: {
          placeholder: {
            type: "string"
          },

          rows: {
            type: "number"
          }
        }
      }
    },

    "number-field": {
      name: "number-field",
      shouldDebounce: true,
      focusable: true,

      schema: {
        properties: {
          step: {
            type: "number"
          },

          min: {
            type: "number"
          },

          max: {
            type: "number"
          },

          precision: {
            type: "number"
          },

          placeholder: {
            type: "string"
          }
        }
      }
    },

    checkbox: {
      name: "checkbox"
    },

    switch: {
      name: "switch"
    },

    slider: {
      name: "slider",
      shouldDebounce: true,

      schema: {
        properties: {
          step: {
            type: "number"
          },

          min: {
            type: "number"
          },

          max: {
            type: "number"
          }
        }
      }
    },

    "date-picker": {
      name: "date-picker",

      schema: {
        properties: {
          min: {
            type: "string",
            format: "date"
          },

          max: {
            type: "string",
            format: "date"
          },

          format: {
            type: "string",
            enum: ["date", "date-time"],
            default: "date"
          }
        }
      }
    },

    "date-time-picker": {
      name: "date-time-picker",

      schema: {
        properties: {
          min: {
            type: "string",
            format: "date-time"
          },

          max: {
            type: "string",
            format: "date-time"
          }
        }
      }
    },

    "time-picker": {
      name: "time-picker",

      schema: {
        properties: {
          min: {
            type: "string",
            format: "time"
          },

          max: {
            type: "string",
            format: "time"
          }
        }
      }
    },

    "color-picker": {
      name: "color-picker",
      shouldDebounce: true
    },

    select: {
      name: "select",
      focusable: true,
      itemsBased: true,
      multipleCompat: true,

      schema: {
        properties: {
          placeholder: {
            type: "string"
          }
        }
      }
    },

    autocomplete: {
      name: "autocomplete",
      focusable: true,
      itemsBased: true,
      multipleCompat: true,

      schema: {
        properties: {
          placeholder: {
            type: "string"
          }
        }
      }
    },

    combobox: {
      name: "combobox",
      focusable: true,
      itemsBased: true,
      multipleCompat: true,

      schema: {
        properties: {
          placeholder: {
            type: "string"
          }
        }
      }
    },

    "number-combobox": {
      name: "number-combobox",
      focusable: true,
      itemsBased: true,
      multipleCompat: true,

      schema: {
        properties: {
          placeholder: {
            type: "string"
          },

          step: {
            type: "number"
          },

          min: {
            type: "number"
          },

          max: {
            type: "number"
          }
        }
      }
    },

    "checkbox-group": {
      name: "checkbox-group",
      itemsBased: true,
      multipleCompat: true
    },

    "switch-group": {
      name: "switch-group",
      itemsBased: true,
      multipleCompat: true
    },

    "radio-group": {
      name: "radio-group",
      itemsBased: true
    },

    "file-input": {
      name: "file-input",
      focusable: true,
      multipleCompat: true,
      isFileInput: true,

      schema: {
        properties: {
          accept: {
            type: "string"
          },

          placeholder: {
            type: "string"
          }
        }
      }
    },

    "one-of-select": {
      name: "one-of-select",

      schema: {
        required: ["oneOfItems"],

        properties: {
          emptyData: {
            type: "boolean"
          },

          autocomplete: {
            type: "boolean"
          },

          oneOfItems: {
            type: "array",

            items: {
              $ref: "https://json-layout.github.io/normalized-layout-keyword#/$defs/one-of-item"
            }
          }
        }
      }
    }
  },

  localizeErrors: localizeErrors
};

const nodeComponents = {
  
  "section": sectionNode,
  
  "text-field": textfieldNode,
  
  "textarea": textareaNode,
  
  "switch": switchNode,
  
  "list": listNode,
  
  "one-of-select": oneofselectNode,
  
  "autocomplete": autocompleteNode,
    
}

const props = defineProps({
  modelValue: {
    type: null,
    default: null
  },
  options: {
    /** @type import('vue').PropType<import('@koumoul/vjsf/types.js').PartialVjsfOptions | null> */
    type: Object,
    default: null
  }
})

const emit = defineEmits(emits)

const { el, statefulLayout, stateTree } = useVjsf(
  null,
  computed(() => props.modelValue),
  computed(() => ({...props.options, components: {}})),
  nodeComponents,
  emit,
  null,
  null,
  computed(() => compiledLayout)
)

</script>

<template>
  <div
    ref="el"
    class="vjsf"
  >
    <tree
      v-if="statefulLayout && stateTree"
      :model-value="stateTree"
      :stateful-layout="statefulLayout"
    />
  </div>
</template>